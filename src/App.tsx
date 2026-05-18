/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from "framer-motion";
import { Play, RotateCcw, Shield, Trophy, Zap, MousePointer2, Heart, Star, ChevronUp, Settings as SettingsIcon, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

// --- Types ---
interface GameState {
  score: number;
  highScore: number;
  bankedPoints: number; // Persistent currency
  isGameOver: boolean;
  isVictory: boolean;
  isStarted: boolean;
  showSettings: boolean;
  showGarage: boolean;
  currentVehicle: string;
  ownedVehicles: string[];
  level: number;
  stageTimer: number;
  maxStageTime: number;
  currentStage: number;
  lives: number;
  rank: number;
  xp: number;
  maxXp: number;
  energy: number;
  maxEnergy: number;
  isDashing: boolean;
  isSlowMo: boolean;
  powerUpActive: PowerUpType | null;
  powerUpTime: number;
  bossHealth: number | null;
  bossMaxHealth: number | null;
  upgrades: {
    rapidFire: number;
    multiShot: number;
    dashPower: number;
    armor: number; // New upgrade
  };
  settings: {
    screenShake: boolean;
    graphicsQuality: 'high' | 'low';
    sensitivity: number;
    showGrid: boolean;
    controlMode: 'follow' | 'joystick' | 'dpad';
  };
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

enum PowerUpType {
  RAPID_FIRE = "RAPID_FIRE",
  SHIELD = "SHIELD",
  MULTI_SHOT = "MULTI_SHOT",
  TIME_WARP = "TIME_WARP",
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size?: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  type: 'circle' | 'square' | 'triangle' | 'hex' | 'boss';
  rot: number;
  rotSpeed: number;
  color: string;
  health: number;
  pattern?: 'normal' | 'zigzag' | 'homing';
  amplitude?: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  color: string;
  size: number;
}

interface Hazard {
  id: number;
  x: number;
  y: number;
  size: number;
  type: 'mine' | 'laser';
  timer: number;
  active: boolean;
}

// --- Constants ---
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];

const POWERUP_COLORS: Record<PowerUpType, string> = {
  [PowerUpType.RAPID_FIRE]: "#f59e0b",
  [PowerUpType.SHIELD]: "#3b82f6",
  [PowerUpType.MULTI_SHOT]: "#ec4899",
  [PowerUpType.TIME_WARP]: "#06b6d4",
};

const RANK_REQUIREMENTS = [
  { rank: 1, xp: 100, label: "ألفا_١", perk: "نظام السلاح القياسي" },
  { rank: 2, xp: 250, label: "ألفا_٢", perk: "تعزيز استقرار النواة" },
  { rank: 3, xp: 500, label: "بيتا_١", perk: "تعديل إطلاق النار السريع" },
  { rank: 4, xp: 1000, label: "بيتا_٢", perk: "وحدة الانتشار العريضة" },
  { rank: 5, xp: 2000, label: "غاما_١", perk: "تطور الشكل النجمي" },
  { rank: 6, xp: 4000, label: "غاما_٢", perk: "تحسين الاندفاع التكتيكي" },
  { rank: 7, xp: 8000, label: "دلتا_١", perk: "درع الطاقة التلقائي" },
  { rank: 8, xp: 15000, label: "دلتا_٢", perk: "طلقات النبض الحراري" },
  { rank: 9, xp: 30000, label: "أوميغا", perk: "السيطرة الكاملة" },
];

const VEHICLES = [
  { id: 'interceptor', name: 'المعترض_X', desc: 'مركبة متوازنة للمهام القياسية.', price: 0, stats: { hp: 3, speed: 1, power: 1 }, color: '#3b82f6', icon: Zap },
  { id: 'dreadnought', name: 'المدمرة_V', desc: 'درع ثقيل مع نظام إطلاق هجين.', price: 5000, stats: { hp: 6, speed: 0.7, power: 1.5 }, color: '#ef4444', icon: Shield },
  { id: 'phantom', name: 'الشبح_Z', desc: 'سرعة فائقة مع قدرة عالية على المناورة.', price: 8000, stats: { hp: 2, speed: 1.5, power: 1.2 }, color: '#a855f7', icon: MousePointer2 },
  { id: 'apex', name: 'أبيكس_برايم', desc: 'المركبة الأسطورية، قمة التكنولوجيا العصبية.', price: 25000, stats: { hp: 5, speed: 1.3, power: 2 }, color: '#eab308', icon: Star },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedUpgrades = JSON.parse(localStorage.getItem("neon_strike_permanent_upgrades") || "{}");
    const savedVehicles = JSON.parse(localStorage.getItem("neon_strike_owned_vehicles") || '["interceptor"]');
    const currentVehicleId = localStorage.getItem("neon_strike_current_vehicle") || "interceptor";
    const currentVehicle = VEHICLES.find(v => v.id === currentVehicleId) || VEHICLES[0];
    
    return {
      score: 0,
      highScore: parseInt(localStorage.getItem("neon_strike_high_score") || "0"),
      bankedPoints: parseInt(localStorage.getItem("neon_strike_scrap") || "1500"), // Added starting scrap for testing
      isGameOver: false,
      isVictory: false,
      isStarted: false,
      showSettings: false,
      showGarage: false,
      currentVehicle: currentVehicleId,
      ownedVehicles: savedVehicles,
      level: 1,
      stageTimer: 60,
      maxStageTime: 60,
      currentStage: 1,
      lives: currentVehicle.stats.hp + (savedUpgrades.armor || 0),
      rank: 1,
      xp: 0,
      maxXp: 100,
      energy: 100,
      maxEnergy: 100,
      isDashing: false,
      isSlowMo: false,
      powerUpActive: null,
      powerUpTime: 0,
      bossHealth: null,
      bossMaxHealth: null,
      upgrades: {
        rapidFire: savedUpgrades.rapidFire || 0,
        multiShot: savedUpgrades.multiShot || 0,
        dashPower: 1 + (savedUpgrades.dashPower || 0),
        armor: savedUpgrades.armor || 0,
      },
      settings: {
        screenShake: true,
        graphicsQuality: 'high',
        sensitivity: 1,
        showGrid: true,
        controlMode: 'follow',
      },
    };
  });

  const [notification, setNotification] = useState<{ text: string, id: number } | null>(null);

  const notify = useCallback((text: string) => {
    setNotification({ text, id: Date.now() });
    setTimeout(() => setNotification(null), 2000);
  }, []);

  const savePermanentUpgrades = useCallback((upgrades: GameState['upgrades'], scrap: number) => {
    localStorage.setItem("neon_strike_permanent_upgrades", JSON.stringify(upgrades));
    localStorage.setItem("neon_strike_scrap", scrap.toString());
  }, []);

  const stars = useRef<Star[]>([]);
  const joystickState = useRef({ active: false, x: 0, y: 0, ang: 0, dist: 0, centerX: 100, centerY: 0 });
  const playerVel = useRef({ x: 0, y: 0 });
  const lastDashTime = useRef(0);
  const dashCooldown = 1500; // ms

  // Initialize Stars
  useEffect(() => {
    const newStars: Star[] = [];
    for (let i = 0; i < 100; i++) {
        newStars.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 2,
            speed: 0.5 + Math.random() * 2,
            opacity: 0.1 + Math.random() * 0.5
        });
    }
    stars.current = newStars;
  }, []);

  // Game Loop Refs
  const requestRef = useRef<number>(null);
  const playerPos = useRef({ x: 0, y: 0, currentX: 0, currentY: 0, tilt: 0 });
  const enemies = useRef<Enemy[]>([]);
  const hazards = useRef<Hazard[]>([]);
  const bullets = useRef<Bullet[]>([]);
  const particles = useRef<Particle[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const frameCount = useRef(0);
  const lastTime = useRef(0);
  const screenShake = useRef(0);
  const nextId = useRef(0);
  const stageSecondCounter = useRef(0);

  // --- Game Functions ---

  const createHazard = useCallback((width: number, height: number) => {
    const type: Hazard['type'] = Math.random() > 0.5 ? 'mine' : 'laser';
    return {
      id: nextId.current++,
      x: Math.random() * width,
      y: Math.random() * (height * 0.6) + (height * 0.2), // Central area
      size: type === 'mine' ? 40 : 10,
      type,
      timer: 0,
      active: type === 'mine'
    };
  }, []);

  const createEnemy = useCallback((width: number, typeOverride?: Enemy['type']) => {
    // Aggressive difficulty scaling
    const gameDurationFactor = Math.floor(frameCount.current / 300); // Scales faster than before
    const levelFactor = gameDurationFactor + (gameState.currentStage * 3);
    const type: Enemy['type'] = typeOverride || (Math.random() > 0.8 ? 'hex' : Math.random() > 0.6 ? (Math.random() > 0.5 ? 'square' : 'triangle') : 'circle');
    
    let pattern: Enemy['pattern'] = 'normal';
    if (levelFactor > 5 && Math.random() > 0.6) pattern = 'zigzag';
    if (levelFactor > 10 && Math.random() > 0.7) pattern = 'homing';

    return {
      id: nextId.current++,
      x: Math.random() * width,
      y: -50,
      size: type === 'hex' ? 50 : 20 + Math.random() * 30,
      speed: (pattern === 'homing' ? 2 : 3 + Math.random() * 4) + (levelFactor * 0.4),
      type,
      rot: 0,
      rotSpeed: (Math.random() - 0.5) * 0.25,
      color: type === 'hex' ? '#ffffff' : COLORS[Math.floor(Math.random() * COLORS.length)],
      health: (type === 'hex' ? 8 : type === 'boss' ? 50 : 1) + Math.floor(levelFactor / 10),
      pattern,
      amplitude: 50 + Math.random() * 50,
    };
  }, [gameState.currentStage]);

  const spawnBoss = useCallback((width: number) => {
    const boss: Enemy = {
      id: nextId.current++,
      x: width / 2,
      y: -100,
      size: 150,
      speed: 1,
      type: 'boss',
      rot: 0,
      rotSpeed: 0.02,
      color: "#ef4444",
      health: 50 + (gameState.currentStage * 20),
      pattern: 'normal',
    };
    enemies.current.push(boss);
    setGameState(prev => ({ ...prev, bossHealth: boss.health, bossMaxHealth: boss.health }));
  }, [gameState.currentStage]);

  const spawnPowerUp = (x: number, y: number) => {
    const types = Object.values(PowerUpType);
    const type = types[Math.floor(Math.random() * types.length)];
    powerUps.current.push({
      x, y, type, color: POWERUP_COLORS[type], size: 30
    });
  };

  const spawnExplosion = (x: number, y: number, color: string, count = 20, size = 2) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color,
        size
      });
    }
  };

  const spawnBullet = () => {
    const currentVehicle = VEHICLES.find(v => v.id === gameState.currentVehicle) || VEHICLES[0];
    const color = currentVehicle.color;
    const vy = -12 * currentVehicle.stats.speed; // Faster vehicles have faster bullets
    const power = currentVehicle.stats.power;
    
    const count = Math.min(1 + gameState.upgrades.multiShot + (currentVehicle.id === 'dreadnought' ? 1 : 0), 25); 
    const spread = 15;
    const totalWidth = (count - 1) * spread;
    
    for (let i = 0; i < count; i++) {
        const offsetX = -totalWidth / 2 + i * spread;
        bullets.current.push({ 
          x: playerPos.current.currentX + offsetX, 
          y: playerPos.current.currentY, 
          vx: (offsetX / spread) * (0.8 * power), 
          vy: vy * (power > 1.2 ? 1.2 : 1), 
          color 
        });
    }
  };

  const resetGame = useCallback(() => {
    const savedUpgrades = JSON.parse(localStorage.getItem("neon_strike_permanent_upgrades") || "{}");
    const currentVehicleId = localStorage.getItem("neon_strike_current_vehicle") || "interceptor";
    const currentVehicle = VEHICLES.find(v => v.id === currentVehicleId) || VEHICLES[0];
    
    enemies.current = [];
    particles.current = [];
    bullets.current = [];
    powerUps.current = [];
    frameCount.current = 0;
    nextId.current = 0;
    stageSecondCounter.current = 0;
    setGameState(prev => ({
      ...prev,
      score: 0,
      isGameOver: false,
      isVictory: false,
      isStarted: true,
      showSettings: false,
      showGarage: false,
      level: 1,
      stageTimer: 60,
      maxStageTime: 60,
      currentStage: 1,
      lives: currentVehicle.stats.hp + (savedUpgrades.armor || 0),
      rank: 1,
      xp: 0,
      maxXp: 100,
      energy: 100,
      maxEnergy: 100,
      isDashing: false,
      isSlowMo: false,
      powerUpActive: null,
      powerUpTime: 0,
      bossHealth: null,
      bossMaxHealth: null,
      upgrades: {
        rapidFire: savedUpgrades.rapidFire || 0,
        multiShot: savedUpgrades.multiShot || 0,
        dashPower: 1 + (savedUpgrades.dashPower || 0),
        armor: savedUpgrades.armor || 0,
      }
    }));
  }, []);

  const returnToMenu = useCallback(() => {
    setGameState(prev => ({ ...prev, isStarted: false, isGameOver: false, isVictory: false }));
  }, []);

  const handleDash = useCallback(() => {
    if (gameState.energy >= 40 && !gameState.isDashing && performance.now() - lastDashTime.current > dashCooldown) {
      setGameState(prev => ({ ...prev, isDashing: true, energy: prev.energy - 40 }));
      lastDashTime.current = performance.now();
      screenShake.current = 3;
      spawnExplosion(playerPos.current.currentX, playerPos.current.currentY, "#3b82f6", 20, 4);
      
      // Radial Shockwave if high energy
      if (gameState.energy > 80) {
        for (let i = 0; i < 360; i += 30) {
          const rad = (i * Math.PI) / 180;
          bullets.current.push({
            x: playerPos.current.currentX,
            y: playerPos.current.currentY,
            vx: Math.cos(rad) * 15,
            vy: Math.sin(rad) * 15,
            color: "#06b6d4"
          });
        }
      }
    }
  }, [gameState.energy, gameState.isDashing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        handleDash();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDash]);

  const update = (time: number) => {
    lastTime.current = time;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { width, height } = canvas;

    const timeScale = gameState.isSlowMo ? 0.3 : (gameState.powerUpActive === PowerUpType.TIME_WARP ? 0.5 : 1.0);

    // Movement Logic
    if (gameState.settings.controlMode === 'follow') {
      const followResponsiveness = (gameState.isDashing ? 0.9 : 0.6) * gameState.settings.sensitivity;
      
      const prevX = playerPos.current.currentX;
      playerPos.current.currentX += (playerPos.current.x - playerPos.current.currentX) * followResponsiveness;
      playerPos.current.currentY += (playerPos.current.y - playerPos.current.currentY) * followResponsiveness;
      
      playerVel.current.x = (playerPos.current.currentX - prevX);
      playerPos.current.tilt = playerVel.current.x * 0.05;
    } else {
      // Joystick or DPad momentum
      const moveSpeed = (gameState.isDashing ? 28 : 12) * gameState.settings.sensitivity;
      const targetVelX = joystickState.current.x * moveSpeed;
      const targetVelY = joystickState.current.y * moveSpeed;
      
      const snappiness = gameState.isDashing ? 0.9 : 0.6;
      playerVel.current.x += (targetVelX - playerVel.current.x) * snappiness;
      playerVel.current.y += (targetVelY - playerVel.current.y) * snappiness;
      
      playerPos.current.currentX += playerVel.current.x;
      playerPos.current.currentY += playerVel.current.y;
      
      // Screen bounds
      playerPos.current.currentX = Math.max(20, Math.min(width - 20, playerPos.current.currentX));
      playerPos.current.currentY = Math.max(20, Math.min(height - 20, playerPos.current.currentY));
    }

    // Energy Regeneration & Depletion
    if (gameState.isDashing) {
      setGameState(prev => {
        const nextEnergy = Math.max(0, prev.energy - (0.8 / (prev.upgrades.dashPower || 1)));
        return {
          ...prev,
          energy: nextEnergy,
          isDashing: nextEnergy > 0
        };
      });
    } else {
      if (gameState.energy < gameState.maxEnergy) {
        setGameState(prev => ({ ...prev, energy: Math.min(prev.maxEnergy, prev.energy + 0.15) }));
      }
    }

    // Starfield animation
    const speedMult = 1 + (Math.hypot(playerVel.current.x, playerVel.current.y) * 0.1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    stars.current.forEach(star => {
      star.y += star.speed * speedMult;
      if (star.y > height) {
        star.y = -10;
        star.x = Math.random() * width;
      }
      ctx.moveTo(star.x, star.y);
      ctx.arc(star.x, star.y, star.size * (speedMult > 1.5 ? 1.5 : 1), 0, Math.PI * 2);
    });
    ctx.fill();

    // Faster screen shake decay
    if (screenShake.current > 0) {
      if (gameState.settings.screenShake) {
        screenShake.current -= 0.2;
      } else {
        screenShake.current = 0;
      }
    }

    // Clear and background
    ctx.save();
    if (gameState.settings.screenShake && screenShake.current > 0) {
      ctx.translate((Math.random() - 0.5) * screenShake.current * 10, (Math.random() - 0.5) * screenShake.current * 10);
    }
    
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Optimized Background Grid
    if (gameState.settings.showGrid) {
      const bgHue = (gameState.level * 40) % 360;
      ctx.strokeStyle = `hsla(${bgHue}, 40%, 30%, 0.05)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 150) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 150) {
        ctx.moveTo(0, y); ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    if (gameState.isStarted && !gameState.isGameOver && !gameState.isVictory) {
      frameCount.current++;
      stageSecondCounter.current++;

      // Stage Timer logic (1 second interval)
      if (stageSecondCounter.current >= 60) {
        stageSecondCounter.current = 0;
        setGameState(prev => {
          if (prev.stageTimer <= 1) {
            // Stage Complete! Bank current XP as Scrap
            const scrapGained = prev.xp;
            const newBankedPoints = prev.bankedPoints + scrapGained;
            localStorage.setItem("neon_strike_scrap", newBankedPoints.toString());

            const nextStage = prev.currentStage + 1;
            const nextTime = 60 + (nextStage * 30);
            screenShake.current = 3;
            spawnExplosion(width/2, height/2, "#fff", 100, 5);
            return {
              ...prev,
              bankedPoints: newBankedPoints,
              currentStage: nextStage,
              stageTimer: nextTime,
              maxStageTime: nextTime,
              xp: 0, // Reset stage XP after banking
              lives: Math.min(prev.lives + 1, 5 + prev.upgrades.armor) 
            };
          }
          return { ...prev, stageTimer: prev.stageTimer - 1 };
        });
      }

      // Powerup Timer
      if (gameState.powerUpActive) {
        setGameState(prev => {
          if (prev.powerUpTime <= 0) return { ...prev, powerUpActive: null, powerUpTime: 0 };
          return { ...prev, powerUpTime: prev.powerUpTime - 1 };
        });
      }

      // Shooting Logic
      const fireRate = Math.max(1, 15 - (gameState.upgrades.rapidFire * 2));
      if (frameCount.current % fireRate === 0) {
        spawnBullet();
      }

      // Boss Spawn Logic - Simplified per stage
      if (gameState.stageTimer === 30 && !gameState.bossHealth) {
        spawnBoss(width);
      }

      // Difficulty ramping - Accelerated Horde based on stage
      const baseRate = 35;
      const spawnRate = Math.max(5, baseRate - (gameState.currentStage * 5) - Math.floor(frameCount.current / 800));
      if (frameCount.current % spawnRate === 0 && !gameState.bossHealth) {
        enemies.current.push(createEnemy(width));
      }

      if (frameCount.current % (spawnRate * 5) === 0 && !gameState.bossHealth) {
        hazards.current.push(createHazard(width, height));
      }

      // Update and Draw Hazards
      hazards.current = hazards.current.filter(h => {
        h.timer += 1 * timeScale;
        
        ctx.save();
        if (h.type === 'mine') {
          const pulse = Math.sin(h.timer * 0.1) * 5;
          ctx.beginPath();
          ctx.arc(h.x, h.y, (h.size / 2) + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = h.timer % 20 < 10 ? "#ef4444" : "#ff9999";
          ctx.lineWidth = 2;
          ctx.stroke();
          
          if (Math.hypot(h.x - playerPos.current.currentX, h.y - playerPos.current.currentY) < h.size) {
            if (!gameState.isDashing) {
                setGameState(prev => ({ ...prev, lives: Math.max(0, prev.lives - 1), isGameOver: prev.lives <= 1 }));
                spawnExplosion(h.x, h.y, "#ef4444", 40, 5);
                screenShake.current = 5;
                return false;
            } else {
                spawnExplosion(h.x, h.y, "#fff", 20, 2);
                return false;
            }
          }
        } else if (h.type === 'laser') {
            const opacity = Math.min(1, h.timer / 100);
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 15;
            ctx.beginPath();
            ctx.moveTo(0, h.y);
            ctx.lineTo(width, h.y);
            ctx.stroke();
            
            if (h.timer > 120 && Math.abs(playerPos.current.currentY - h.y) < 15) {
                if (!gameState.isDashing) {
                    setGameState(prev => ({ ...prev, lives: Math.max(0, prev.lives - 1), isGameOver: prev.lives <= 1 }));
                    screenShake.current = 3;
                }
            }
            if (h.timer > 150) return false;
        }
        ctx.restore();
        return h.timer < 300;
      });

    // Update Bullets
    bullets.current = bullets.current.filter(b => {
      b.x += b.vx * timeScale;
      b.y += b.vy * timeScale;
        
        ctx.fillStyle = b.color;
        // ShadowBlur removed for performance
        ctx.fillRect(b.x - 2, b.y - 12, 4, 24);

        return b.y > -20;
      });

      // Update PowerUps
      powerUps.current = powerUps.current.filter(p => {
        p.y += 2;
        
        // Draw PowerUp
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(frameCount.current * 0.05);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        
        // Pill shape - simplified for performance
        ctx.beginPath();
        ctx.roundRect(-p.size/2, -p.size/2, p.size, p.size, 8);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.restore();

        const powerUpNames: Record<string, string> = {
          [PowerUpType.RAPID_FIRE]: 'إطلاق سريع',
          [PowerUpType.MULTI_SHOT]: 'طلقة متعددة',
          [PowerUpType.SHIELD]: 'الدرع النسبي',
          [PowerUpType.TIME_WARP]: 'تباطؤ الزمن'
        };

        // Collection
        const dist = Math.hypot(p.x - playerPos.current.currentX, p.y - playerPos.current.currentY);
        if (dist < 40) {
          setGameState(prev => {
            const nextUpgrades = { ...prev.upgrades };
            if (p.type === PowerUpType.RAPID_FIRE) nextUpgrades.rapidFire++;
            if (p.type === PowerUpType.MULTI_SHOT) nextUpgrades.multiShot++;
            
            return { 
              ...prev, 
              powerUpActive: p.type === PowerUpType.SHIELD ? PowerUpType.SHIELD : p.type === PowerUpType.TIME_WARP ? PowerUpType.TIME_WARP : prev.powerUpActive, 
              powerUpTime: 500,
              score: prev.score + 50,
              upgrades: nextUpgrades
            };
          });
          notify(`تم اكتساب ${powerUpNames[p.type] || 'تطوير جديد'}`);
          spawnExplosion(p.x, p.y, p.color, 15, 4);
          return false;
        }

        return p.y < height + 50;
      });

      // Update and Draw Enemeies
      enemies.current = enemies.current.filter((enemy) => {
        // Pattern logic
        if (enemy.pattern === 'zigzag') {
          enemy.x += Math.sin(enemy.y / (enemy.amplitude || 50)) * 5;
        } else if (enemy.pattern === 'homing') {
          const dx = playerPos.current.currentX - enemy.x;
          enemy.x += Math.sign(dx) * 1.5;
        }

        if (enemy.type === 'boss') {
          enemy.y = Math.min(enemy.y + 0.5 * timeScale, 150);
          enemy.x += Math.sin(frameCount.current * 0.02) * 5 * timeScale;
        } else {
          enemy.y += enemy.speed * timeScale;
        }
        
        enemy.rot += enemy.rotSpeed;

        // Collision with Player
        const distToPlayer = Math.hypot(enemy.x - playerPos.current.currentX, enemy.y - playerPos.current.currentY);
        if (distToPlayer < (enemy.size / 2 + 15)) {
          // Invulnerable during Dash
          if (gameState.isDashing) {
            enemy.health -= 5; // Smashing through enemies
            spawnExplosion(enemy.x, enemy.y, enemy.color, 10);
            if (enemy.health > 0) return true;
          }

          if (gameState.powerUpActive === PowerUpType.SHIELD) {
            setGameState(prev => ({ ...prev, powerUpActive: null, powerUpTime: 0 }));
            spawnExplosion(enemy.x, enemy.y, enemy.color);
            screenShake.current = 1;
            return false;
          } else {
            // Check lives
            if (gameState.lives > 1) {
              setGameState(prev => ({ ...prev, lives: prev.lives - 1 }));
              spawnExplosion(enemy.x, enemy.y, enemy.color, 30, 3);
              screenShake.current = 2;
              return false; // Destroy enemy but don't game over
            } else {
              setGameState(prev => {
                const newHighScore = Math.max(prev.highScore, prev.score);
                if (newHighScore > prev.highScore) localStorage.setItem("neon_strike_high_score", newHighScore.toString());
                return { ...prev, isGameOver: true, lives: 0, highScore: newHighScore };
              });
              spawnExplosion(playerPos.current.currentX, playerPos.current.currentY, "#ffffff", 40, 4);
              screenShake.current = 4;
            }
          }
        }

        // Collision with Bullets
        bullets.current = bullets.current.filter(bullet => {
          const distToEnemy = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
          if (distToEnemy < (enemy.size / 2 + 10)) {
            enemy.health--;
            spawnExplosion(bullet.x, bullet.y, enemy.color, 5);
            screenShake.current = Math.max(screenShake.current, 0.5); // Add slight hit feedback
            if (enemy.health <= 0) {
              let gainedXp = enemy.type === 'hex' ? 20 : enemy.type === 'boss' ? 500 : 5;
              
              if (enemy.type === 'boss') {
                setGameState(prev => ({ 
                  ...prev, 
                  bossHealth: null, 
                  score: prev.score + 2000, 
                  level: prev.level + 1,
                  xp: prev.xp + gainedXp
                }));
                spawnExplosion(enemy.x, enemy.y, enemy.color, 100, 5);
                screenShake.current = 5;
              } else {
                setGameState(prev => ({ 
                  ...prev, 
                  score: prev.score + (enemy.type === 'hex' ? 50 : 10),
                  xp: prev.xp + gainedXp
                }));
                // Extremely frequent power-ups for "upgrades everywhere" feel: 45% chance
                if (Math.random() > 0.55) spawnPowerUp(enemy.x, enemy.y);
                spawnExplosion(enemy.x, enemy.y, enemy.color, 15);
              }
              enemy.id = -1; // Mark for deletion
            }
            return false;
          }
          return true;
        });

      // Draw Monster Enemy
        if (enemy.id === -1) return false;
        
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(enemy.rot);
        ctx.strokeStyle = enemy.color;
        ctx.lineWidth = enemy.type === 'boss' ? 6 : 2;
        
        if (gameState.settings.graphicsQuality === 'high' && enemies.current.length < 15) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = enemy.color;

          // Enemy Trail
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -enemy.size);
          ctx.stroke();
          ctx.restore();
        }

        // Draw Monster Body
        ctx.beginPath();
        if (enemy.type === 'circle') {
          ctx.arc(0, 0, enemy.size / 2, 0, Math.PI * 2);
        } else if (enemy.type === 'square') {
          ctx.rect(-enemy.size / 2, -enemy.size / 2, enemy.size, enemy.size);
        } else if (enemy.type === 'hex') {
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = (enemy.size / 2) * Math.cos(angle);
            const y = (enemy.size / 2) * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        } else if (enemy.type === 'boss') {
           ctx.rect(-enemy.size / 2, -enemy.size / 2, enemy.size, enemy.size);
           ctx.stroke();
           ctx.rotate(-enemy.rot * 2);
           ctx.strokeRect(-enemy.size / 3, -enemy.size / 3, enemy.size / 1.5, enemy.size / 1.5);
        } else {
          ctx.moveTo(0, -enemy.size / 2);
          ctx.lineTo(enemy.size / 2, enemy.size / 2);
          ctx.lineTo(-enemy.size / 2, enemy.size / 2);
          ctx.closePath();
        }
        ctx.stroke();

        // Draw Ears/Tentacles (Monster looks)
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2 + enemy.rot;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * enemy.size / 2, Math.sin(angle) * enemy.size / 2);
            ctx.lineTo(Math.cos(angle) * enemy.size * 0.8, Math.sin(angle) * enemy.size * 0.8);
            ctx.stroke();
        }

        // Draw Eyes
        ctx.fillStyle = "#fff";
        const eyeOffset = enemy.size / 4;
        const eyeSize = Math.max(3, enemy.size / 10);
        ctx.beginPath();
        ctx.arc(-eyeOffset, -eyeOffset / 2, eyeSize, 0, Math.PI * 2);
        ctx.arc(eyeOffset, -eyeOffset / 2, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Eye Pupils (Homing at player)
        const dx = playerPos.current.currentX - enemy.x;
        const dy = playerPos.current.currentY - enemy.y;
        const angleToPlayer = Math.atan2(dy, dx);
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(-eyeOffset + Math.cos(angleToPlayer) * 1.5, -eyeOffset / 2 + Math.sin(angleToPlayer) * 1.5, eyeSize / 2, 0, Math.PI * 2);
        ctx.arc(eyeOffset + Math.cos(angleToPlayer) * 1.5, -eyeOffset / 2 + Math.sin(angleToPlayer) * 1.5, eyeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw Mouth
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const mouthWidth = enemy.size / 3;
        const mouthOpen = Math.sin(frameCount.current * 0.2 + enemy.id) * 5;
        if (distToPlayer < 200) {
            // Aggressive expression
            ctx.moveTo(-mouthWidth / 2, eyeOffset);
            ctx.lineTo(0, eyeOffset + 5 + mouthOpen);
            ctx.lineTo(mouthWidth / 2, eyeOffset);
        } else {
            // Neutral/Creepy smile
            ctx.arc(0, eyeOffset, mouthWidth / 2, 0, Math.PI);
        }
        ctx.stroke();

        ctx.restore();

        return enemy.y < height + 200;
      });

      // Rank Progression Removed from mid-game (moved to garage)
      // We still keep the level scaling for difficulty but remove the automatic rank-up
      const newLevel = Math.floor(gameState.score / 2000) + 1;
      if (newLevel !== gameState.level) {
        setGameState(prev => ({ ...prev, level: newLevel }));
        screenShake.current = 1.5;
      }
    }

    // Update and Draw Particles
    particles.current = particles.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      return p.life > 0;
    });

    // Draw Player Trail
    if (gameState.isStarted && !gameState.isGameOver) {
      ctx.save();
      const trailColor = gameState.powerUpActive ? POWERUP_COLORS[gameState.powerUpActive!] : "#3b82f6";
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = trailColor;
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Use velocity to draw a fading trail segment
      const dx = playerVel.current.x * 2.5;
      const dy = playerVel.current.y * 2.5;
      ctx.moveTo(playerPos.current.currentX, playerPos.current.currentY);
      ctx.lineTo(playerPos.current.currentX - dx, playerPos.current.currentY - dy);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Organic Player Core
    if (!gameState.isGameOver || frameCount.current === 0) {
      ctx.save();
      ctx.translate(playerPos.current.currentX, playerPos.current.currentY);
      ctx.rotate(playerPos.current.tilt);
      
      const pColor = gameState.powerUpActive ? POWERUP_COLORS[gameState.powerUpActive!] : (VEHICLES.find(v => v.id === gameState.currentVehicle)?.color || "#3b82f6");
      const pulse = Math.sin(frameCount.current * 0.15);
      
      // Visual Bloom / Glow
      if (gameState.settings.graphicsQuality === 'high') {
        ctx.shadowBlur = 12 + pulse * 4;
        ctx.shadowColor = pColor;
      }

      // Outer organic glow ring
      ctx.strokeStyle = pColor;
      ctx.lineWidth = 2;
      
      const sides = gameState.rank === 1 ? 3 : gameState.rank === 2 ? 4 : gameState.rank === 3 ? 5 : gameState.rank === 4 ? 6 : 8;
      const radius = 25 + pulse * 2;
      
      ctx.beginPath();
      if (gameState.rank >= 5) {
        // Unique Geometric "Stellar" Shape
        for (let i = 0; i < 360; i += 5) {
          const rad = (i * Math.PI) / 180;
          const wobble = Math.sin(rad * 12 + frameCount.current * 0.1) * 4;
          const r = radius + wobble;
          const x = r * Math.cos(rad);
          const y = r * Math.sin(rad);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      } else {
        // Simple Polygon Evolution
        for (let i = 0; i < sides; i++) {
          const angle = (i * Math.PI * 2) / sides - Math.PI / 2 + (frameCount.current * 0.02); // Add subtle rotation
          const x = radius * Math.cos(angle);
          const y = radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();

      // Reset shadow for core to prevent blur stack
      ctx.shadowBlur = 0;

      // Inner pulsating core layers
      ctx.fillStyle = pColor;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1.0;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      // Power-up Duration Indicator (Circular)
      if (gameState.powerUpActive && gameState.powerUpTime > 0) {
        ctx.save();
        ctx.rotate(-Math.PI/2);
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, (Math.PI * 2 * (gameState.powerUpTime / 500)));
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
      
      // Core details based on rank
      ctx.strokeStyle = "#fff";
      ctx.globalAlpha = 0.5;
      if (gameState.rank >= 2) {
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.stroke();
      }
      if (gameState.rank >= 4) {
          for (let i = 0; i < 4; i++) {
              const a = (i * Math.PI) / 2 + frameCount.current * 0.05;
              ctx.strokeRect(Math.cos(a) * 35, Math.sin(a) * 35, 5, 5);
          }
      }

      // Shield Effect
      if (gameState.powerUpActive === PowerUpType.SHIELD) {
        ctx.beginPath();
        ctx.arc(0, 0, 45 + pulse * 5, 0, Math.PI * 2);
        ctx.setLineDash([5, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.restore();
    }

    // Draw On-Canvas Joystick
    if (gameState.isStarted && !gameState.isGameOver && !gameState.isVictory && gameState.settings.controlMode === 'joystick' && joystickState.current.active) {
      ctx.save();
      const jX = joystickState.current.centerX;
      const jY = joystickState.current.centerY || (height - 100);
      
      // Outer ring
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(jX, jY, 60, 0, Math.PI * 2);
      ctx.stroke();

      // Inner guidelines
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(jX - 20, jY); ctx.lineTo(jX + 20, jY);
      ctx.moveTo(jX, jY - 20); ctx.lineTo(jX, jY + 20);
      ctx.stroke();

      // Knob
      const knobX = jX + Math.cos(joystickState.current.ang) * joystickState.current.dist;
      const knobY = jY + Math.sin(joystickState.current.ang) * joystickState.current.dist;
      
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#3b82f6";
      if (gameState.settings.graphicsQuality === 'high') {
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#3b82f6";
      }
      ctx.beginPath();
      ctx.arc(knobX, knobY, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      
      ctx.restore();
    }

    ctx.restore();
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = width * dpr;
        canvasRef.current.height = height * dpr;
        
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }

        if (frameCount.current === 0) {
          playerPos.current = { x: width / 2, y: height * 0.8, currentX: width / 2, currentY: height * 0.8, tilt: 0 };
        }
      }
    };

    const handleGlobalRelease = () => {
      handleInputEnd();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    
    handleResize();
    requestRef.current = requestAnimationFrame(update);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [gameState.isStarted, gameState.isGameOver, gameState.level, gameState.powerUpActive, gameState.bossHealth]);

  const handleMouseMove = (e: ReactMouseEvent | ReactTouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = (e as ReactMouseEvent).clientX - rect.left;
      y = (e as ReactMouseEvent).clientY - rect.top;
    }

    if (gameState.settings.controlMode === 'follow') {
      playerPos.current.x = x;
      playerPos.current.y = y;
    } else if (joystickState.current.active) {
      const dx = x - joystickState.current.centerX;
      const dy = y - (joystickState.current.centerY || (rect.height - 100));
      const dist = Math.sqrt(dx*dx + dy*dy);
      const limit = 60;
      
      if (dist > 0) {
        const clampedDist = Math.min(dist, limit);
        const deadzone = 5;
        if (dist > deadzone) {
            joystickState.current.x = (dx / dist) * (clampedDist / limit);
            joystickState.current.y = (dy / dist) * (clampedDist / limit);
            joystickState.current.dist = clampedDist;
            joystickState.current.ang = Math.atan2(dy, dx);
        } else {
            joystickState.current.x = 0;
            joystickState.current.y = 0;
            joystickState.current.dist = 0;
        }
      }
    }
  };

  const handleInputStart = (e: ReactMouseEvent | ReactTouchEvent) => {
    // Prevent joystick if clicking on UI
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;

    if (gameState.settings.controlMode === 'joystick') {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x, y;
      if ('touches' in e) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
      } else {
        x = (e as ReactMouseEvent).clientX - rect.left;
        y = (e as ReactMouseEvent).clientY - rect.top;
      }
      
      // If touch is on the left 40% of the screen, use it as dynamic center
      if (x < rect.width * 0.4) {
        joystickState.current.active = true;
        joystickState.current.centerX = x;
        joystickState.current.centerY = y;
      } else {
        // Fallback or fixed? Let's just allow touch anywhere on the left
        joystickState.current.active = true;
        joystickState.current.centerX = Math.min(x, 150);
        joystickState.current.centerY = y;
      }
    }
  };

  const handleInputEnd = () => {
    joystickState.current.active = false;
    joystickState.current.x = 0;
    joystickState.current.y = 0;
    joystickState.current.dist = 0;
  };

  return (
    <div 
      className="fixed inset-0 bg-[#0a0a0c] text-white font-sans overflow-hidden flex flex-col items-center justify-center cursor-none touch-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      onMouseDown={handleInputStart}
      onMouseUp={handleInputEnd}
      onTouchStart={handleInputStart}
      onTouchEnd={handleInputEnd}
    >
      {/* Neural Garage Overlay */}
      <AnimatePresence>
        {gameState.showGarage && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-black/98 backdrop-blur-md flex flex-col items-center p-6 md:p-12 overflow-y-auto will-change-transform"
            dir="rtl"
          >
            <div className="max-w-4xl w-full">
              <div className="flex justify-between items-center mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tighter text-blue-400">مستودع_التطوير_العصبي</h2>
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mt-1">تخصيص أنظمة القتال المتقدمة</p>
                </div>
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, showGarage: false }))}
                  className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-red-500/20 hover:border-red-500/50 transition-all text-gray-400 hover:text-red-400 pointer-events-auto"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Scrap Balance */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="col-span-1 md:col-span-2 p-8 bg-blue-500/10 border border-blue-500/20 rounded-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all" />
                  <div className="relative z-10">
                    <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-2 block">رصيد خردة النيون المتاح</span>
                    <div className="flex items-baseline gap-4">
                      <span className="text-6xl font-bold font-mono tracking-tighter text-white">{gameState.bankedPoints}</span>
                      <Zap className="w-8 h-8 text-blue-400 animate-pulse" />
                    </div>
                  </div>
                </div>
                
                <div className="p-8 bg-white/5 border border-white/10 rounded-3xl flex flex-col justify-center items-center text-center">
                  <Trophy className="w-8 h-8 text-amber-500 mb-2" />
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">المستوى الحالي</span>
                  <span className="text-3xl font-bold text-white">رتبة_{gameState.rank}</span>
                </div>
              </div>

              {/* Upgrade Grid */}
              <div className="mb-12">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                  <SettingsIcon className="w-6 h-6 text-blue-400" />
                  تحسين_الأنظمة_الأساسية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {[
                    { id: 'rapidFire', title: 'سرعة الإطلاق', desc: 'تقليل الفاصل الزمني بين الطلقات.', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10', level: gameState.upgrades.rapidFire, cost: (gameState.upgrades.rapidFire + 1) * 800 },
                    { id: 'multiShot', title: 'انتشار القذائف', desc: 'زيادة عدد مسارات إطلاق النار.', icon: ChevronUp, color: 'text-pink-500', bg: 'bg-pink-500/10', level: gameState.upgrades.multiShot, cost: (gameState.upgrades.multiShot + 1) * 1500 },
                    { id: 'armor', title: 'درع النواة', desc: 'زيادة الصحة الأساسية للمركبة.', icon: Heart, color: 'text-red-500', bg: 'bg-red-500/10', level: gameState.upgrades.armor, cost: (gameState.upgrades.armor + 1) * 2000 },
                    { id: 'dashPower', title: 'توربو الاندفاع', desc: 'تحسين كفاءة استهلاك طاقة الاندفاع.', icon: Star, color: 'text-blue-500', bg: 'bg-blue-500/10', level: gameState.upgrades.dashPower - 1, cost: gameState.upgrades.dashPower * 1200 },
                  ].map((upg) => (
                    <div key={upg.id} className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:border-white/20 transition-all flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className={`p-4 ${upg.bg} rounded-2xl`}>
                          <upg.icon className={`w-6 h-6 ${upg.color}`} />
                        </div>
                        <div className="text-right">
                          <h4 className="text-xl font-bold text-white">{upg.title}</h4>
                          <div className="flex gap-1 justify-end mt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div key={'upg-level-' + i} className={`w-3 h-1 rounded-full ${i < upg.level ? upg.color.replace('text', 'bg') : 'bg-white/10'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 font-mono leading-relaxed">{upg.desc}</p>
                      <button 
                        onClick={() => {
                          if (gameState.bankedPoints >= upg.cost && upg.level < 5) {
                            const newUpgrades = { ...gameState.upgrades, [upg.id]: upg.id === 'dashPower' ? gameState.upgrades.dashPower + 1 : (gameState.upgrades as any)[upg.id] + 1 };
                            const newScrap = gameState.bankedPoints - upg.cost;
                            setGameState(prev => ({ ...prev, bankedPoints: newScrap, upgrades: newUpgrades }));
                            savePermanentUpgrades(newUpgrades, newScrap);
                            notify(`تمت ترقية ${upg.title}`);
                          }
                        }}
                        className={`mt-auto w-full py-4 rounded-2xl font-bold font-mono text-sm pointer-events-auto transition-all ${gameState.bankedPoints >= upg.cost && upg.level < 5 ? "bg-white text-black hover:bg-blue-400" : "bg-white/5 text-white/20 cursor-not-allowed"}`}
                      >
                        {upg.level >= 5 ? "أقصى مستوى" : `تطوير | ${upg.cost}`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vehicle Shop */}
              <div>
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                  <Play className="w-6 h-6 text-purple-400 rotate-90" />
                  أساطيل_المركبات_المغلفة
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {VEHICLES.map((veh) => {
                    const isOwned = gameState.ownedVehicles.includes(veh.id);
                    const isSelected = gameState.currentVehicle === veh.id;
                    
                    return (
                      <div key={veh.id} className={`p-6 border rounded-3xl transition-all flex flex-col gap-4 ${isSelected ? "bg-blue-500/10 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]" : "bg-white/5 border-white/10 hover:border-white/20"}`}>
                        <div className="flex justify-between items-start">
                          <div className={`p-4 rounded-2xl bg-white/5`}>
                            <veh.icon className={`w-8 h-8`} style={{ color: veh.color }} />
                          </div>
                          <div className="text-right">
                            <h4 className="text-xl font-bold text-white">{veh.name}</h4>
                            <div className="flex gap-2 justify-end mt-1">
                               <div className="flex flex-col items-end">
                                 <span className="text-[8px] text-gray-500 uppercase">الدرع</span>
                                 <div className="flex gap-0.5">
                                   {Array.from({ length: 5 }).map((_, i) => <div key={'hp-bar-' + i} className={`w-2 h-1 rounded-full ${i < veh.stats.hp ? "bg-red-500" : "bg-white/10"}`} />)}
                                 </div>
                               </div>
                               <div className="flex flex-col items-end">
                                 <span className="text-[8px] text-gray-500 uppercase">السرعة</span>
                                 <div className="flex gap-0.5">
                                   {Array.from({ length: 5 }).map((_, i) => <div key={'speed-bar-' + i} className={`w-2 h-1 rounded-full ${i < veh.stats.speed * 3 ? "bg-blue-500" : "bg-white/10"}`} />)}
                                 </div>
                               </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-400 leading-relaxed">{veh.desc}</p>
                        
                        <div className="flex gap-2 mt-auto">
                          {isOwned ? (
                            <button 
                              onClick={() => {
                                setGameState(prev => ({ ...prev, currentVehicle: veh.id }));
                                localStorage.setItem("neon_strike_current_vehicle", veh.id);
                                notify(`تم تفعيل ${veh.name}`);
                              }}
                              disabled={isSelected}
                              className={`flex-1 py-4 rounded-2xl font-bold font-mono text-sm pointer-events-auto transition-all ${isSelected ? "bg-blue-500 text-white cursor-default" : "bg-white/10 text-white hover:bg-white/20"}`}
                            >
                              {isSelected ? "المركبة النشطة" : "استخدام المركبة"}
                            </button>
                          ) : (
                            <button 
                              onClick={() => {
                                if (gameState.bankedPoints >= veh.price) {
                                  const newOwned = [...gameState.ownedVehicles, veh.id];
                                  const newScrap = gameState.bankedPoints - veh.price;
                                  setGameState(prev => ({ ...prev, bankedPoints: newScrap, ownedVehicles: newOwned }));
                                  localStorage.setItem("neon_strike_owned_vehicles", JSON.stringify(newOwned));
                                  localStorage.setItem("neon_strike_scrap", newScrap.toString());
                                  notify(`تم شراء ${veh.name}`);
                                }
                              }}
                              className={`flex-1 py-4 rounded-2xl font-bold font-mono text-sm pointer-events-auto transition-all ${gameState.bankedPoints >= veh.price ? "bg-white text-black hover:bg-green-400" : "bg-white/5 text-white/20 cursor-not-allowed"}`}
                            >
                              ابتياع | {veh.price} خردة
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Header / HUD - Visible only during active gameplay */}
      <AnimatePresence>
        {gameState.isStarted && !gameState.isGameOver && !gameState.isVictory && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 w-full p-4 md:p-8 flex justify-between items-start pointer-events-none z-[150]" 
            dir="rtl"
          >
        <div className="flex flex-col gap-1 items-start max-w-[60%]">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <Zap className={`w-4 h-4 md:w-5 md:h-5 ${gameState.isStarted && !gameState.isGameOver ? "text-blue-400 animate-pulse" : "text-gray-600"}`} />
            <h1 className="text-lg md:text-2xl font-bold tracking-tighter">ضربة_النيون</h1>
            <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] md:text-[10px] font-mono shrink-0 text-white">مرحلة_{gameState.currentStage}</div>
          </div>

          {/* Health Bar Grid */}
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {Array.from({ length: (VEHICLES.find(v => v.id === gameState.currentVehicle)?.stats.hp || 3) + (gameState.upgrades.armor || 0) }).map((_, i) => (
              <motion.div
                key={'hud-hp-' + i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`w-5 h-1.5 md:w-8 md:h-2 rounded-full ${i < gameState.lives ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-white/10"}`}
              />
            ))}
          </div>

          {/* Stage Progress Bar */}
          <div className="mt-2 md:mt-4 flex flex-col gap-1 w-32 md:w-64">
             <div className="flex justify-between text-[7px] md:text-[8px] font-mono opacity-80 uppercase tracking-widest gap-2 text-white">
                <span className="truncate">استقرار النواة</span>
                <span>{gameState.stageTimer}ث</span>
             </div>
             <div className="w-full h-1 md:h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                   initial={{ width: "100%" }}
                   animate={{ width: `${(gameState.stageTimer / gameState.maxStageTime) * 100}%` }}
                   className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
             </div>
          </div>
          
          {/* XP Bar */}
          <div className="mt-2 md:mt-4 flex flex-col gap-1 w-24 md:w-48 relative">
            <div className="text-[7px] md:text-[8px] font-mono opacity-50 uppercase tracking-widest text-right">الخبرة</div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(gameState.xp / gameState.maxXp) * 100}%` }}
                className="h-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"
              />
              {/* Milestone pips */}
              <div className="absolute inset-0 flex justify-around pointer-events-none">
                 {[1, 2, 3].map(p => <div key={'pip-' + p} className="w-[1px] h-full bg-white/20" />)}
              </div>
            </div>
            {/* Upgrade requirement hint */}
            <div className="mt-1 text-[7px] text-blue-400/60 font-mono text-right flex items-center justify-end gap-1">
               <span>التالي: {RANK_REQUIREMENTS[gameState.rank]?.perk}</span>
               <ChevronUp className="w-2 h-2" />
            </div>
          </div>

          {/* Energy Bar / Dash Status */}
          <div className="mt-2 md:mt-4 flex flex-col gap-1 w-24 md:w-48">
            <div className="flex justify-between items-center text-[7px] md:text-[8px] font-mono opacity-50 uppercase tracking-widest">
               <span>الاندفاع</span>
               <span className={gameState.energy >= 40 ? "text-blue-400" : "text-red-400"}>
                 {gameState.energy >= 40 ? "جاهز" : "شحن"}
               </span>
            </div>
            <div className="w-full h-1 md:h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
              <motion.div 
                animate={{ 
                  width: `${(gameState.energy / gameState.maxEnergy) * 100}%`,
                  backgroundColor: gameState.energy >= 40 ? "#3b82f6" : "#4b5563"
                }}
                className="h-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              />
            </div>
          </div>

          <div className="flex gap-1 mt-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Heart 
                key={'heart-' + i}
                className={`w-4 h-4 ${i < gameState.lives ? "text-red-500 fill-red-500" : "text-white/10"}`} 
              />
            ))}
          </div>
          
          {(gameState.powerUpActive || gameState.upgrades.rapidFire > 0 || gameState.upgrades.multiShot > 0) && (
            <div className="mt-4 flex flex-col gap-4 items-start text-right">
               {gameState.powerUpActive && (
                 <div className="flex flex-col gap-1 w-full">
                    <div className="text-[8px] uppercase tracking-widest opacity-40 font-mono">تطوير نشط</div>
                    <div className="flex items-center justify-end gap-2">
                       <span className="text-[10px] font-mono" style={{ color: POWERUP_COLORS[gameState.powerUpActive] }}>
                         {gameState.powerUpActive === PowerUpType.SHIELD ? 'درع الحماية' : gameState.powerUpActive === PowerUpType.TIME_WARP ? 'التواء زمني' : 'تشويه'}
                       </span>
                       <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-current transition-all duration-100" 
                           style={{ width: `${(gameState.powerUpTime / 500) * 100}%`, color: POWERUP_COLORS[gameState.powerUpActive] }} 
                         />
                       </div>
                    </div>
                 </div>
               )}
               
               <div className="flex flex-col gap-3">
                  <div className="text-[8px] uppercase tracking-widest opacity-40 font-mono">أنظمة السلاح</div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    {gameState.upgrades.rapidFire > 0 && (
                      <div className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[8px] font-mono border border-amber-500/30 rounded uppercase shadow-[0_0_10px_rgba(245,158,11,0.2)] flex items-center gap-1">
                        مستوى إطلاق {gameState.upgrades.rapidFire}
                        <Zap className="w-2 h-2" />
                      </div>
                    )}
                    {gameState.upgrades.multiShot > 0 && (
                      <div className="px-2 py-0.5 bg-pink-500/20 text-pink-500 text-[8px] font-mono border border-pink-500/30 rounded uppercase shadow-[0_0_10px_rgba(236,72,153,0.2)] flex items-center gap-1">
                        مستوى انتشار {gameState.upgrades.multiShot}
                        <ChevronUp className="w-2 h-2" />
                      </div>
                    )}
                    {(gameState.upgrades.rapidFire === 0 && gameState.upgrades.multiShot === 0) && (
                      <div className="text-[8px] opacity-30 font-mono">الإخراج القياسي</div>
                    )}
                  </div>
               </div>
            </div>
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>

      {/* Boss Health Bar */}
      {gameState.bossHealth !== null && gameState.bossMaxHealth !== null && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-64 h-2 bg-white/10 border border-white/10 rounded-full overflow-hidden z-20">
          <motion.div 
            initial={{ width: "100%" }}
            animate={{ width: `${(gameState.bossHealth / gameState.bossMaxHealth) * 100}%` }}
            className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          />
          <div className="absolute top-full left-0 w-full text-center text-[8px] font-mono uppercase tracking-[0.2em] text-red-400 mt-1">مواجهة الزعيم</div>
        </div>
      )}

      {/* Danger Wave Notification */}
      {gameState.isStarted && gameState.stageTimer % 30 < 5 && gameState.stageTimer !== gameState.maxStageTime && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div className="flex flex-col items-center gap-4 bg-red-600/20 border border-red-500/50 backdrop-blur-md px-12 py-6 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.3)]">
            <h3 className="text-4xl font-black tracking-tighter text-red-500 animate-pulse">خطر: موجة هجوم</h3>
            <p className="text-xs font-mono text-white/50 uppercase tracking-[0.3em]">زيادة نشاط الأشكال الهندسية</p>
          </div>
        </motion.div>
      )}

      {/* Control Overlays */}
      {gameState.isStarted && !gameState.isGameOver && !gameState.isVictory && (
        <>
          {/* Dash Button */}
          <div className="absolute bottom-8 right-8 z-40 flex flex-col gap-6 pointer-events-auto">
            <button 
              onMouseDown={(e) => { e.stopPropagation(); handleDash(); }}
              onTouchStart={(e) => { e.stopPropagation(); handleDash(); }}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all active:scale-95 ${gameState.energy >= 40 ? "bg-blue-500/20 border-blue-400 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]" : "bg-white/5 border-white/10 text-white/20"}`}
            >
              <Zap className={`w-8 h-8 ${gameState.energy >= 40 ? "animate-pulse" : ""}`} />
              <div className="absolute -bottom-6 text-[8px] font-mono uppercase tracking-widest text-center w-24">اندفاع [Space]</div>
            </button>

            <button 
                onMouseDown={(e) => { e.stopPropagation(); setGameState(prev => ({ ...prev, isSlowMo: true })); }}
                onMouseUp={(e) => { e.stopPropagation(); setGameState(prev => ({ ...prev, isSlowMo: false })); }}
                onTouchStart={(e) => { e.stopPropagation(); setGameState(prev => ({ ...prev, isSlowMo: true })); }}
                onTouchEnd={(e) => { e.stopPropagation(); setGameState(prev => ({ ...prev, isSlowMo: false })); }}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all active:scale-95 ${gameState.isSlowMo ? "bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "bg-white/5 border-white/10 text-white/20"}`}
            >
                <div className="absolute inset-0 rounded-full border border-emerald-400/20 animate-ping opacity-20" />
                <RotateCcw className={`w-8 h-8 ${gameState.isSlowMo ? "animate-spin" : ""}`} />
                <div className="absolute -bottom-6 text-[8px] font-mono uppercase tracking-widest text-center w-24">تركيز [Hold]</div>
            </button>
          </div>

          {/* D-Pad for Static Mode */}
          {gameState.settings.controlMode === 'dpad' && (
            <div className="absolute bottom-8 left-8 z-40 grid grid-cols-3 gap-2 pointer-events-auto scale-125 origin-bottom-left" dir="ltr">
              <div />
              <button 
                onMouseDown={() => { joystickState.current.active = true; joystickState.current.y = -1; }}
                onMouseUp={() => { joystickState.current.y = 0; }}
                onTouchStart={() => { joystickState.current.active = true; joystickState.current.y = -1; }}
                onTouchEnd={() => { joystickState.current.y = 0; }}
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center"
              >
                <ChevronUp className="w-5 h-5 text-blue-400" />
              </button>
              <div />
              
              <button 
                onMouseDown={() => { joystickState.current.active = true; joystickState.current.x = -1; }}
                onMouseUp={() => { joystickState.current.x = 0; }}
                onTouchStart={() => { joystickState.current.active = true; joystickState.current.x = -1; }}
                onTouchEnd={() => { joystickState.current.x = 0; }}
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center"
              >
                 <ChevronUp className="w-5 h-5 -rotate-90 text-blue-400" />
              </button>
              <button 
                onMouseDown={() => { joystickState.current.active = true; joystickState.current.y = 1; }}
                onMouseUp={() => { joystickState.current.y = 0; }}
                onTouchStart={() => { joystickState.current.active = true; joystickState.current.y = 1; }}
                onTouchEnd={() => { joystickState.current.y = 0; }}
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center"
              >
                 <ChevronUp className="w-5 h-5 rotate-180 text-blue-400" />
              </button>
              <button 
                onMouseDown={() => { joystickState.current.active = true; joystickState.current.x = 1; }}
                onMouseUp={() => { joystickState.current.x = 0; }}
                onTouchStart={() => { joystickState.current.active = true; joystickState.current.x = 1; }}
                onTouchEnd={() => { joystickState.current.x = 0; }}
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center"
              >
                 <ChevronUp className="w-5 h-5 rotate-90 text-blue-400" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Main Canvas Container */}
      <div 
        ref={containerRef}
        className="fixed inset-0 bg-[#050505] overflow-hidden select-none touch-none font-sans z-[100]"
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
      >
        {/* Power-up Notification Overlay */}
        <AnimatePresence>
          {notification && (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: -50, scale: 0.8 }}
              animate={{ opacity: 1, y: 50, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-blue-500/20 border border-blue-500/50 backdrop-blur-xl px-8 py-3 rounded-2xl pointer-events-none"
              dir="rtl"
            >
              <span className="text-white font-bold tracking-widest text-lg">{notification.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <canvas ref={canvasRef} className="block w-full h-full" />

        <AnimatePresence>
          {!gameState.isStarted && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-110"
            >
              <div className="absolute top-8 right-8 pointer-events-auto flex gap-4">
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, showSettings: true }))}
                  className="p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors shadow-lg"
                >
                  <SettingsIcon className="w-6 h-6 text-blue-400" />
                </button>
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="max-w-2xl w-full px-4 md:px-8 text-center space-y-4 md:space-y-8 overflow-y-auto max-h-screen py-8"
              >
                <div className="space-y-2 md:space-y-4">
                  <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">القاعدة الأساسية</h2>
                  <p className="text-gray-400 font-mono text-[10px] md:text-sm leading-relaxed uppercase tracking-widest px-4 md:px-0">
                    دمر الأشكال الهندسية. اجمع الخردة للتطوير في المستودع.
                  </p>
                </div>

                {/* Scrap Counter on Menu */}
                <div className="flex items-center justify-center gap-4 py-2 opacity-80">
                   <div className="flex flex-col items-end">
                      <span className="text-[10px] font-mono text-blue-400">الخردة المتاحة</span>
                      <span className="text-2xl font-mono text-white">{gameState.bankedPoints}</span>
                   </div>
                   <Zap className="w-8 h-8 text-blue-400 animate-pulse" />
                </div>

                {/* HUD Data Square - Main Page Context */}
                <div className="flex items-center justify-center p-6 md:p-8 bg-black/60 backdrop-blur-md border border-white/10 rounded-[2.5rem] shadow-2xl gap-6 md:gap-12 will-change-transform">
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] opacity-50 font-mono text-white">البيانات_المجمعة</span>
                    <span className="text-3xl md:text-5xl font-mono tabular-nums leading-none font-bold text-white tracking-tighter">
                      {gameState.score.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-12 w-[1px] bg-white/10" />
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] opacity-50 font-mono text-white">سلامة_النواة</span>
                    <div className="flex items-center gap-1.5 mt-1">
                       {Array.from({ length: 5 }).map((_, i) => (
                         <div 
                           key={'main-heart-' + i} 
                           className={`w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full border border-white/20 transition-all ${i < gameState.lives ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "bg-white/5 opacity-20"}`} 
                         />
                       ))}
                    </div>
                  </div>
                  <div className="h-12 w-[1px] bg-white/10" />
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] opacity-50 font-mono text-white">السجل_الأقصى</span>
                    <div className="flex items-center gap-2">
                       <Trophy className="w-4 h-4 text-amber-400" />
                       <span className="text-xl md:text-2xl font-mono font-bold text-white">{gameState.highScore.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 justify-center px-4">
                  <motion.button 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={resetGame}
                    className="group relative flex-1 px-10 py-5 bg-blue-600 hover:bg-blue-500 transition-all rounded-full font-bold text-lg md:text-xl tracking-widest flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(59,130,246,0.4)] pointer-events-auto"
                  >
                    <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                    بدء المهمة
                  </motion.button>

                  <motion.button 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setGameState(prev => ({ ...prev, showGarage: true }))}
                    className="group relative flex-1 px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/20 transition-all rounded-full font-bold text-lg md:text-xl tracking-widest flex items-center justify-center gap-3 pointer-events-auto"
                  >
                    <ChevronUp className="w-5 h-5 md:w-6 md:h-6 rotate-90 text-blue-400" />
                    مستودع التطوير
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {gameState.showSettings && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl z-50"
            >
              <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-[3rem] p-10 space-y-8 relative overflow-hidden" dir="rtl">
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, showSettings: false }))}
                  className="absolute top-6 left-6 p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center space-y-2">
                  <h3 className="text-3xl font-bold tracking-tighter text-blue-400">الإعدادات</h3>
                  <div className="w-12 h-1 bg-blue-500 mx-auto rounded-full" />
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto px-2">
                  <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl">
                    <span className="text-sm font-mono uppercase tracking-widest text-white/60">اهتزاز الشاشة</span>
                    <button 
                      onClick={() => setGameState(prev => ({ ...prev, settings: { ...prev.settings, screenShake: !prev.settings.screenShake } }))}
                      className={`w-12 h-6 rounded-full relative transition-colors ${gameState.settings.screenShake ? "bg-blue-600" : "bg-white/10"}`}
                    >
                      <motion.div 
                        animate={{ x: gameState.settings.screenShake ? 26 : 4 }}
                        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-lg"
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl">
                    <span className="text-sm font-mono uppercase tracking-widest text-white/60">إظهار الشبكة</span>
                    <button 
                      onClick={() => setGameState(prev => ({ ...prev, settings: { ...prev.settings, showGrid: !prev.settings.showGrid } }))}
                      className={`w-12 h-6 rounded-full relative transition-colors ${gameState.settings.showGrid ? "bg-blue-600" : "bg-white/10"}`}
                    >
                      <motion.div 
                        animate={{ x: gameState.settings.showGrid ? 26 : 4 }}
                        className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-lg"
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl">
                    <span className="text-sm font-mono uppercase tracking-widest text-white/60">أسلوب التحكم</span>
                    <div className="flex gap-2">
                       {['follow', 'joystick', 'dpad'].map((m) => (
                         <button 
                          key={m}
                          onClick={() => setGameState(prev => ({ ...prev, settings: { ...prev.settings, controlMode: m as any } }))}
                          className={`px-3 py-1 rounded-lg font-mono text-[10px] uppercase transition-all ${gameState.settings.controlMode === m ? "bg-blue-600 text-white" : "bg-white/5 text-white/40"}`}
                         >
                           {m === 'follow' ? 'تتبع' : m === 'joystick' ? 'عصا حرّة' : 'ثابت'}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 p-4 bg-white/2 border border-white/5 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-mono uppercase tracking-widest text-white/60">حساسية التحكم</span>
                      <span className="text-xs font-mono text-blue-400">{gameState.settings.sensitivity.toFixed(1)}x</span>
                    </div>
                    <input 
                      type="range" min="0.5" max="3" step="0.1"
                      value={gameState.settings.sensitivity}
                      onChange={(e) => setGameState(prev => ({ ...prev, settings: { ...prev.settings, sensitivity: parseFloat(e.target.value) } }))}
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl">
                    <span className="text-sm font-mono uppercase tracking-widest text-white/60">جودة الجرافيك</span>
                    <div className="flex gap-2">
                       {['low', 'high'].map((q) => (
                         <button 
                          key={q}
                          onClick={() => setGameState(prev => ({ ...prev, settings: { ...prev.settings, graphicsQuality: q as any } }))}
                          className={`px-3 py-1 rounded-lg font-mono text-[10px] uppercase transition-all ${gameState.settings.graphicsQuality === q ? "bg-blue-600 text-white" : "bg-white/5 text-white/40"}`}
                         >
                           {q === 'high' ? 'عالية' : 'منخفضة'}
                         </button>
                       ))}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setGameState(prev => ({ ...prev, showSettings: false }))}
                  className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-blue-500 hover:text-white transition-all uppercase tracking-widest"
                >
                  حفظ وإغلاق
                </button>
              </div>
            </motion.div>
          )}

          {gameState.isVictory && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-blue-950/80 backdrop-blur-md z-30 overflow-hidden"
            >
              {/* Victory Particles Effect */}
              <div className="absolute inset-0 pointer-events-none">
                 {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={'victory-particle-' + i}
                      initial={{ y: "110%", x: Math.random() * 100 + "%" }}
                      animate={{ y: "-10%", opacity: [0, 1, 0] }}
                      transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 2 }}
                      className="absolute w-1 h-10 bg-blue-400 blur-sm"
                    />
                 ))}
              </div>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center space-y-8 md:space-y-12 relative z-10 w-full px-4 overflow-y-auto max-h-screen py-10"
              >
                <div className="space-y-2 md:space-y-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-20 h-20 md:w-32 md:h-32 border-4 border-blue-500 border-t-transparent rounded-full mx-auto flex items-center justify-center"
                  >
                     <Star className="w-8 h-8 md:w-12 md:h-12 text-blue-400 fill-current" />
                  </motion.div>
                  <h2 className="text-5xl md:text-8xl font-black tracking-tighter text-blue-400">متطورة</h2>
                  <p className="text-sm md:text-xl font-mono text-white/50 tracking-[0.4em]">اكتمل الصعود للنهاية</p>
                </div>
                
                <div className="bg-white/5 border border-white/20 p-6 md:p-12 rounded-[2.5rem] md:rounded-[4rem] backdrop-blur-lg shadow-2xl space-y-4 md:space-y-6 max-w-lg mx-auto will-change-transform">
                  <div className="text-5xl md:text-7xl font-mono font-bold text-white tracking-widest">
                    {gameState.score.toString().padStart(6, '0')}
                  </div>
                  <div className="flex gap-4 md:gap-8 justify-center">
                    <div className="text-center">
                      <div className="text-[7px] md:text-[8px] uppercase tracking-widest opacity-40 font-mono mb-1">الرتبة المتممة</div>
                      <div className="text-lg md:text-2xl font-bold text-blue-400 font-mono">ألفا_{gameState.rank}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-center px-6">
                  <button 
                    onClick={resetGame}
                    className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 md:px-10 md:py-5 bg-blue-500 text-white rounded-full font-bold text-lg md:text-xl shadow-xl hover:bg-white hover:text-blue-500 transition-all"
                  >
                    <RotateCcw className="w-5 h-5 md:w-6 md:h-6" />
                    إعادة البدء
                  </button>
                  <button 
                    onClick={returnToMenu}
                    className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 md:px-10 md:py-5 bg-white/10 text-white border border-white/20 rounded-full font-bold text-lg md:text-xl backdrop-blur-md hover:bg-white/20 transition-all"
                  >
                    العودة للرئيسية
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {gameState.isGameOver && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/60 backdrop-blur-xl z-30"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="text-center space-y-6 md:space-y-8 w-full px-6"
                dir="rtl"
              >
                <div className="space-y-2">
                  <h2 className="text-5xl md:text-8xl font-black tracking-tighter text-red-500">تم الإنهاء</h2>
                  <p className="text-sm md:text-xl font-mono text-white/50 tracking-[0.2em]">فقدت سلامة النواة</p>
                </div>
                
                <div className="bg-black/80 border border-white/10 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] backdrop-blur-md inline-block shadow-2xl max-w-sm w-full will-change-transform">
                  <div className="text-[8px] md:text-[10px] uppercase tracking-[0.3em] opacity-40 font-mono mb-2 md:mb-4 text-white">الإنتاج النهائي لهذه المهمة</div>
                  <div className="text-5xl md:text-7xl font-mono font-bold text-white mb-2">
                    {gameState.score.toString().padStart(6, '0')}
                  </div>
                  
                  <div className="flex flex-col gap-2 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest">خردة لم يتم استعادتها</span>
                    <span className="text-2xl font-bold font-mono text-white">{gameState.xp}</span>
                  </div>

                  <div className="pt-4 md:pt-6 mt-4 md:mt-6 border-t border-white/10">
                     <p className="text-[10px] font-mono text-gray-500">يجب عليك إنهاء المرحلة لجمع الخردة بشكل دائم.</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-center">
                  <button 
                    onClick={resetGame}
                    className="group flex items-center justify-center gap-3 px-8 py-4 md:px-10 md:py-5 bg-white text-black hover:bg-red-500 hover:text-white transition-all rounded-full font-bold text-lg md:text-xl shadow-xl pointer-events-auto"
                  >
                    <RotateCcw className="w-5 h-5 md:w-6 h-6 transition-transform group-hover:rotate-180 duration-500" />
                    إعادة المحاولة
                  </button>
                  <button 
                    onClick={returnToMenu}
                    className="group flex items-center justify-center gap-3 px-8 py-4 md:px-10 md:py-5 bg-white/5 border border-white/10 text-white hover:bg-white hover:text-black transition-all rounded-full font-bold text-lg md:text-xl backdrop-blur-sm pointer-events-auto"
                  >
                    القاعدة الأساسية
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls / Info Bar */}
      <div className="absolute bottom-0 left-0 w-full p-3 md:p-6 border-t border-white/5 bg-black/60 backdrop-blur-md flex justify-between items-center z-20" dir="rtl">
        <div className="flex gap-4 md:gap-8 items-center">
            <div className="flex items-center gap-2 md:gap-3 text-[8px] md:text-[10px] font-mono">
                <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                <span className="opacity-60 uppercase tracking-widest hidden xs:block">مستقر</span>
            </div>
            <div className="flex items-center gap-2 md:gap-3 text-[8px] md:text-[10px] font-mono">
                <div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-blue-500" />
                <span className="opacity-60 uppercase tracking-widest">v0.4.2</span>
            </div>
        </div>
        
        <div className="hidden md:block">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-mono">
                استوديو الذكاء الاصطناعي من جوجل // PRIME
            </div>
        </div>
      </div>
    </div>
  );
}
