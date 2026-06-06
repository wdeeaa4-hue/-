import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// CORS Middleware to allow requests from mobile app (Capacitor)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Set body size limits for uploaded base64 charts
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Lazy initializer for Google Gen AI client based on user level to support dual keys
function getGeminiClient(isPremium: boolean): GoogleGenAI {
  let key = isPremium ? process.env.GEMINI_API_KEY_PREMIUM : process.env.GEMINI_API_KEY_NORMAL;
  if (!key) {
    key = process.env.GEMINI_API_KEY;
  }
  if (!key) {
    throw new Error("GEMINI_API_KEY is not defined. Please check the Secrets tab.");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Robust helper function to execute generative content with retry and model fallback when encountering high demand or transient failures
async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  params: { contents: any; config?: any }
): Promise<any> {
  const modelOptions = [primaryModel];
  if (primaryModel === "gemini-1.5-flash") {
    modelOptions.push("gemini-1.5-pro");
    modelOptions.push("gemini-2.0-flash-exp");
  } else if (primaryModel === "gemini-2.0-flash") {
    modelOptions.push("gemini-1.5-flash");
    modelOptions.push("gemini-1.5-pro");
  } else {
    modelOptions.push("gemini-1.5-flash");
  }

  let lastError: any = null;

  for (const model of modelOptions) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[AI Predictor] Attempting call using model="${model}" (attempt ${attempt}/2)`);
        const response = await ai.models.generateContent({
          ...params,
          model: model,
        });
        return response;
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || "";
        console.warn(`[AI Predictor] Call failed on model="${model}" (attempt ${attempt}):`, errMsg);

        const isTransient = 
          errMsg.includes("503") || 
          errMsg.includes("UNAVAILABLE") || 
          errMsg.includes("temporary") ||
          errMsg.includes("high demand") ||
          errMsg.includes("limit") ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("500") ||
          error?.status === 503 ||
          error?.status === 429 ||
          error?.status === 500;

        if (!isTransient) {
          // Break inner loop and immediately fall back to another model if it is a structural API mismatch
          break;
        }

        if (attempt < 2) {
          const delay = attempt * 750;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    console.log(`[AI Predictor] Sibling/fallback cascade active: falling back from model="${model}"...`);
  }

  throw lastError || new Error("All fallback models and retries have been exhausted.");
}

// Fetch real-time BTC price from reliable Binance public ticker API
async function getLiveBTCPrice(): Promise<string> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    if (response.ok) {
      const data = await response.json() as { price: string };
      const priceNum = parseFloat(data.price);
      if (!isNaN(priceNum)) {
        return `$${priceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  } catch (error) {
    console.error("Binance BTC Price Fetch failed:", error);
  }
  return "غير متوفر حالياً";
}

// REST API endpoint to predict trend using Vision + Google Search Grounding (multimodal two-step pipeline)
app.post("/api/predict", async (req, res) => {
  try {
    const { image, mimeType, language, isPremium, timeframe } = req.body;

    if (!image || !mimeType) {
      return res.status(400).json({ error: "Missing image attachment or mimeType" });
    }

    const lang = language || "ar"; // ar, en, zh
    const isUserPremium = isPremium === true;
    const ai = getGeminiClient(isUserPremium);
    const modelName = isUserPremium ? "gemini-1.5-pro" : "gemini-1.5-flash";
    const selectedTimeframe = timeframe || (lang === "ar" ? "يوم واحد" : "1 Day");

    // Prepare prompt language parameters
    let promptExtract = "";
    let promptGroundingTemplate: any = null;

    if (lang === "ar") {
      promptExtract = `أنت خبير مالي ومحلل فني محترف لرسوم التداول البيانية والأسواق المالية. أول وظيفة وأهمها هي التحقق بدقة مما إذا كانت الصورة المرفوعة عبارة عن شارت تداول حقيقي أو لقطة شاشة مناسبة من منصة تداول للعملات أو الأسهم أو العملات الرقمية (مثل الشموع اليابانية [candlesticks]، الرسوم البيانية، المؤشرات الفنية، أو واجهة تداول منصة مثل ميتاتريدر، تريدنج فيو أو بينانس). إذا كانت الصورة لقطة عادية لشخص، حيوان، منظر طبيعي، صورة عشوائية، أو شيء غير متعلق بال تداول والتحليل المالي للشارتات، فيجب كتابة الكي "isValidTradingChart": false.
حلل الصورة واستخرج كائن JSON بالصيغة التالية تمامًا:
{
  "isValidTradingChart": true_or_false,
  "assetName": "اسم العملة الرقمية، السهم، أو أداة التداول المكتشفة بالصورة (مثال: BTC/USDT)",
  "technicalPattern": "شرح فني مبسط للمؤشرات والشموع التي تظهر في الصورة، ومستويات الدعم والمقاومة المرصودة والسعر التقريبي الظاهر فيها",
  "searchQuery": "كلمة بحث باللغة الإنجليزية لمحرك بحث جوجل للحصول على آخر المقالات الأخبارية والأحداث والتحاليل الحالية حول هذا الأصل المالي (مثال: BTC price trends analysis news June 2026)"
}
أجب بصيغة JSON فقط دون أي نصوص أخرى خارج القوسين.`;

      promptGroundingTemplate = (asset, pattern, news, btcPrice, tf) => `أنت صحفي ومحلل مالي محترف في وكالة أنباء اقتصادية كبرى. قدم تقريراً تحليلياً فائق الاحترافية بأسلوب إخباري جذاب وموثوق ومفصل للغاية، يبدو كتقرير أخبار أسواق عالمية حقيقي مدعوم ومثبت بنسبة 100% من مصادر حية وموثوقة ومحرك بحث جوجل.

الأصل المالي المكتشف بالصورة: ${asset}
المؤشرات الفنية المرصودة بالشارت: ${pattern}
سعر البيتكوين (BTC) الفوري الفعلي في السوق حالياً ومباشرة من منصة التداول الموثوقة: ${btcPrice}
الفترة الزمنية المختارة لحساب التوقع (Timeframe): ${tf}

ملاحظة هامة جداً: يجب حساب الاتجاه وتحديد الأهداف ونسبة الصعود أو الهبوط بناءً على الفترة الزمنية المطلوبة للتوقع وهي: [${tf}]. إذا كانت قصيرة كـ 5 دقائق، ركز على المضاربة السريعة والتجميع على الفريم الدقيق، وإذا كان يومياً أو أسبوعياً، ركز على الاتجاه العام.

استخدم أداة البحث المدمجة للبحث عن: "${news}" ومطابقة الأخبار.

رد بالصيغة التالية تماماً بهيكل إخباري رائع واحترافي:

📰 [عنوان إخباري فوري ومثير ومقنع للتقرير المالي للـ ${tf}]

🪙 أولاً: تعريف العملة / الأصل المالي:
(اكتب هنا تعريفاً وافياً وشاملاً وصحفياً للأصل المالي المكتشف بالصورة ومكانته الاقتصادية وخصائصه الأساسية)

📈 ثانياً: النسبة المئوية التقريبية للصعود أو الهبوط:
(حدد هنا النسبة المتوقعة والمقدرة تقريبياً للارتفاع أو الانخفاض للحركة السعرية القادمة خلال فترة [${tf}] متضمنة نسبة مئوية تقريبية بناءً على الفريم والشموع اليابانية)

📅 ثالثاً: تقييم الشارت (هل الصورة قديمة أم جديدة):
(قارن بدقة وبشكل مالي محترف بين مستويات الأسعار أو تواريخ التداول التي تظهر في الصورة المرفوعة وبين الأسعار الفورية الحالية في السوق لتحدد وتوضّح للمستخدم هل لقطة الشاشة هذه قديمة أم جديدة ومحدثة. خذ بعين الاعتبار أن سعر البيتكوين الحالي هو ${btcPrice} وقارن الصورة به إذا كان الأصل هو البيتكوين)

🏆 التوقع النهائي للاتجاه لفترة ${tf}: (اختر واحدة فقط وصريحة: "صعود" أو "هبوط")
🎯 نسبة الثقة في التوقع: (نسبة مئوية بين 0% و 100% بناء على قوتها)

🛠️ المؤشرات الفنية المكتشفة وتفصيل التحليل:
(اشرح المؤشرات والأنماط المعروضة من الشموع والدعم والمقاومة بأسلوب فني واحترافي لفريم الـ ${tf})

📰 تحليل السوق والأخبار الفورية الحالية:
(شرح مبسط وواقعي بالاعتماد على نتائج محرك بحث جوجل الفورية، ووضح مصداقية الأخبار 100% لتأكيد الاتجاه)

💡 إستراتيجية التداول المقترحة (للمشتركين المميزين) المتوافقة مع فترة ${tf}:
(تحركات الشراء والبيع، منطقة الدخول المقترحة، جني الأرباح [Take Profit]، ووقف الخسارة [Stop Loss] المصممة خصيصاً للتداول خلال [${tf}])`;
    } else if (lang === "zh") {
      promptExtract = `您是一位专业的金融市场和交易图表技术分析师。您的首要以及最核心的任务是核实上传的图片是否为真实的交易图表、K线图、技术指标、或任一主流交易平台（币安、MT4、TradingView）截图。如果是普通风景照、人脸、纯文本或与金融交易无关的事物，请务必将 "isValidTradingChart" 设置为 false。
  请分析附加的屏幕截图，并精确提取以下格式的 JSON 对象：
  {
    "isValidTradingChart": true_or_false,
    "assetName": "图像中检测到的硬币、代币、股票或交易品种名称（例如: BTC/USDT）",
    "technicalPattern": "简要说明从图表中观察到的指标、蜡烛图模式、支撑位和阻力位",
    "searchQuery": "用于Google搜索的最佳英文检索词，以获取此资产的最新市场情绪、分析和新闻（例如: BTC price trends analysis news June 2026）"
  }
  请仅回答JSON，不要有任何其他包裹结构或说明。`;

      promptGroundingTemplate = (asset, pattern, news, btcPrice, tf) => `您是一位智能金融分析师与财金新闻记者。基于图表分析：
资产对象: ${asset}
技术指征: ${pattern}
当前实时的比特币价格: ${btcPrice}
预测周期范围 (Timeframe): ${tf}

利用谷歌搜索工具检索以下内容: "${news}"。
结合最新的网络新闻和图表分析，在指定周期范围 [${tf}] 内给出最终的市场走势预测。

请按以下格式精确回应，提供结构化、极其专业、像新闻报道一样的中文回答：

📰 [即时金融行情简报 - 针对周期 ${tf}]

🪙 第一：币种/资产定义:
(提供该资产在现代市场中的 utility 和经济重要性的简要、专业定义)

📈 第二：估计上涨或下跌的百分比:
(根据技术分析和蜡烛图形态，预测在指定的周期 ${tf} 内，近期价格可能上涨或下跌的近似百分比，例如 大约上涨 +4.5% 或 大约下跌 -2.0%)

📅 第三：图表评估 (图片是旧的还是新的):
(仔细对比上传图片中的价格与当前的实时基准比特币价格 ${btcPrice} 或行情，评估分析本张图表截图是历史旧图还是最新实时的走势)

🏆 最终预测 (在周期 ${tf} 内): （只能选择其中一个词: "صعود"（看涨） 或 "هبوط"（看跌））
🎯 置信度/概率: （0% 到 100% 之间的百分比）

🛠️ 检测到的技术指标: （细化你在图表中识别的模式）
📰 市场状况与实时新闻: （基于谷歌搜索最新情报的简要讲解，经过100%真实来源核实）
💡 建议交易策略（尊享高级功能）: （推荐针对周期 ${tf} 的建仓点、止盈 [Take Profit] 和 止损 [Stop Loss] 参考计算）`;
    } else {
      // Default to English ("en")
      promptExtract = `You are a professional financial market expert and chart analyst. Your first and most critical job is to verify if the uploaded picture is actual trading chart, candlestick pattern, technical indicators, stock chart or exchange platform screen. If the screenshot is a portrait of a person, regular face, scenery, meme, document or standard unrelated text/item, set isValidTradingChart to false in your response.
Analyze the attached screenshot of trading platform and extract exactly JSON object with these keys:
{
  "isValidTradingChart": true_or_false,
  "assetName": "Identified coin, token, stock, or instrument name (e.g. BTC/USDT)",
  "technicalPattern": "Brief explanation of technical indicators, candlestick pattern, or levels observed in the chart",
  "searchQuery": "Perfect English query for Google search to understand latest market news, developments, and current calendar sentiment (e.g. BTC price trends analysis news June 2026)"
}
Return only JSON without markdown wrappers or conversational intro.`;

      promptGroundingTemplate = (asset, pattern, news, btcPrice, tf) => `You are an elite financial journalist and market analyst for a leading economic agency. Provide an elegant, professional, highly credible, news-style report backed 100% by live Google Search verified resources.

Asset detected: ${asset}
Technical pattern: ${pattern}
Current Real-time Bitcoin (BTC) Price in global exchanges: ${btcPrice}
Target Timeframe selected for prediction calculation: ${tf}

Note: You must tailor the prediction direction, targets, and percentage outcome for the exact user request period of: [${tf}].

Use Google Search to scout for: "${news}".

Structure your output precisely with this beautiful news-like model:

📰 [Urgent economic headline for the asset - Period: ${tf}]

🪙 First: Coin / Asset Definition:
(Provide a concise, professional definition of the asset, its utility, and economic relevance in the modern markets)

📈 Second: Approximate Percentage of Rise or Drop:
(Calculate or project the approximate percentage of price increase or decrease expected within the ${tf} frame, e.g. approx +5.2% or -3.1%)

📅 Third: Chart Assessment (Old or New image):
(Analyze timestamps or price scales on the uploaded chart screenshot against real-time quotes, knowing BTC current price is ${btcPrice}, to evaluate if the image is outdated or freshly generated)

🏆 Final Prediction (for ${tf}): (Either "BULLISH" or "BEARISH")
🎯 Confidence: (A percentage score between 0% and 100%)

🛠️ Detected Technical Structure: (Explanation of technical pattern from chart for time scale ${tf})
📰 Market Analysis & Real-time News: (Analysis leveraging live googleSearch output, 100% verified from credible economic and geopolitics resources)
💡 Suggested Trading Action (Premium VIP): (Recommended Entry level, Take Profit, and Stop Loss targets based on observed technical support/resistances optimized for period ${tf})`;
    }

    // Step 1: Vision Extraction
    const imagePart = {
      inlineData: {
        data: image,
        mimeType: mimeType,
      },
    };

    const extractResponse = await generateContentWithFallback(ai, modelName, {
      contents: [imagePart, { text: promptExtract }],
      config: {
        responseMimeType: "application/json",
      },
    });

    let extractedData = {
      isValidTradingChart: true,
      assetName: "BTC/USDT",
      technicalPattern: "Standard Chart Analysis",
      searchQuery: "BTC price movements news June 2026",
    };

    try {
      const cleanedText = extractResponse.text?.trim() || "{}";
      extractedData = JSON.parse(cleanedText);
    } catch (parseErr) {
      console.warn("Failed to parse vision extracted JSON, using fallbacks:", parseErr, extractResponse.text);
    }

    // BLOCK UNRELATED CHIP IMAGE UPLOADS
    if (extractedData.isValidTradingChart === false) {
      return res.json({
        isValidTradingChart: false,
        assetName: "",
        predictedDirection: "",
        confidenceScore: 0,
        analysisText: "",
        technicalSummary: "",
        sources: [],
      });
    }

    // Fetch live Bitcoin price from reliable sources
    const btcLivePrice = await getLiveBTCPrice();

    // Step 2: Search Grounding using the extracted optimal query and real-time prices
    const finalPrompt = promptGroundingTemplate(
      extractedData.assetName,
      extractedData.technicalPattern,
      extractedData.searchQuery,
      btcLivePrice,
      selectedTimeframe
    );

    const groundResponse = await generateContentWithFallback(ai, modelName, {
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    // Extract grounding URLs and titles properly
    const sources: { title: string; url: string }[] = [];
    const groundingMetadata = groundResponse.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata && groundingMetadata.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "Live Source Reference",
            url: chunk.web.uri,
          });
        }
      }
    }

    // Deconstruct prediction sentiment
    const fullText = groundResponse.text || "";
    let finalPrediction = "صعود"; // default
    let confidence = 75;

    // Direct string matches to return prediction key
    const upperText = fullText.toUpperCase();
    if (upperText.includes("BULLISH") || fullText.includes("صعود") || upperText.includes("看涨") || upperText.includes("買")) {
      finalPrediction = lang === "ar" ? "صعود" : lang === "zh" ? "Bullish (صعود)" : "BULLISH";
    } else if (upperText.includes("BEARISH") || fullText.includes("هبوط") || upperText.includes("看跌") || upperText.includes("賣")) {
      finalPrediction = lang === "ar" ? "هبوط" : lang === "zh" ? "Bearish (هبوط)" : "BEARISH";
    } else {
      finalPrediction = lang === "ar" ? "متذبذب / غير مؤكد" : lang === "zh" ? "盘整 (Neutral)" : "NEUTRAL / UNCERTAIN";
    }

    // Confidence detection
    const confMatch = fullText.match(/(\d+)%/);
    if (confMatch) {
      confidence = parseInt(confMatch[1], 10);
    }

    res.json({
      assetName: extractedData.assetName || "Crypto Asset",
      predictedDirection: finalPrediction,
      confidenceScore: confidence,
      analysisText: fullText,
      technicalSummary: extractedData.technicalPattern,
      sources: sources,
    });
  } catch (error: any) {
    console.error("Prediction endpoint failed:", error);
    const errMessage = error?.message || "";
    if (
      errMessage.includes("quota") || 
      errMessage.includes("QUOTA") || 
      errMessage.includes("RESOURCE_EXHAUSTED") || 
      errMessage.includes("429") || 
      error?.status === 429
    ) {
      res.status(429).json({ 
        error: "QUOTA_EXHAUSTED", 
        message: "Gemini AI API Quota or rate limit exceeded. Please try again soon." 
      });
      return;
    }
    res.status(500).json({ error: errMessage || "Internal AI Service Error" });
  }
});

// Serve frontend build files and setup Vite in development mode
async function establishServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server coordinates established at http://0.0.0.0:${PORT}`);
  });
}

establishServer();
