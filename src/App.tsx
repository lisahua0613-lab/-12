/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, LogOut, Play } from 'lucide-react';

// --- Constants ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 180;
const SPEED_INCREMENT_RATIO = 0.95; // 5% speedup instead of 10%
const SCORE_STEP = 10;

type Point = { x: number; y: number };
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// --- OOP Classes ---

/**
 * Food class handles the generation and rendering of the food item.
 */
class Food {
  position: Point;

  constructor(snakeBody: Point[], canvasWidth: number, canvasHeight: number) {
    this.position = this.generateNewPosition(snakeBody, canvasWidth, canvasHeight);
  }

  generateNewPosition(snakeBody: Point[], canvasWidth: number, canvasHeight: number): Point {
    const cols = Math.floor(canvasWidth / GRID_SIZE);
    const rows = Math.floor(canvasHeight / GRID_SIZE);
    let newPos: Point;
    let isOccupied: boolean;

    do {
      newPos = {
        x: Math.floor(Math.random() * cols) * GRID_SIZE,
        y: Math.floor(Math.random() * rows) * GRID_SIZE,
      };
      // Ensure food doesn't spawn on the snake's body
      isOccupied = snakeBody.some(segment => segment.x === newPos.x && segment.y === newPos.y);
    } while (isOccupied);

    return newPos;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw a stylized flower as food
    const centerX = this.position.x + GRID_SIZE / 2;
    const centerY = this.position.y + GRID_SIZE / 2;
    const radius = GRID_SIZE / 2 - 2;

    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#fbbf24';
    
    // Petals
    ctx.fillStyle = '#ef4444';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const angle = (i * 2 * Math.PI) / 5;
      ctx.ellipse(
        centerX + Math.cos(angle) * 4,
        centerY + Math.sin(angle) * 4,
        4, 6, angle, 0, 2 * Math.PI
      );
      ctx.fill();
    }

    // Center
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
  }
}

/**
 * Snake class handles the movement, growth, and rendering of the snake.
 */
class Snake {
  body: Point[];
  direction: Direction;
  nextDirection: Direction;

  constructor(startX: number, startY: number) {
    this.body = [
      { x: startX, y: startY },
      { x: startX - GRID_SIZE, y: startY },
      { x: startX - 2 * GRID_SIZE, y: startY },
    ];
    this.direction = 'RIGHT';
    this.nextDirection = 'RIGHT';
  }

  setDirection(newDir: Direction) {
    // Prevent instant reversal
    const opposites = {
      UP: 'DOWN',
      DOWN: 'UP',
      LEFT: 'RIGHT',
      RIGHT: 'LEFT',
    };
    if (newDir !== opposites[this.direction]) {
      this.nextDirection = newDir;
    }
  }

  move(canvasWidth: number, canvasHeight: number) {
    this.direction = this.nextDirection;
    const head = { ...this.body[0] };

    switch (this.direction) {
      case 'UP': head.y -= GRID_SIZE; break;
      case 'DOWN': head.y += GRID_SIZE; break;
      case 'LEFT': head.x -= GRID_SIZE; break;
      case 'RIGHT': head.x += GRID_SIZE; break;
    }

    // Wrap around logic for lower difficulty
    if (head.x < 0) head.x = canvasWidth - GRID_SIZE;
    else if (head.x >= canvasWidth) head.x = 0;
    
    if (head.y < 0) head.y = canvasHeight - GRID_SIZE;
    else if (head.y >= canvasHeight) head.y = 0;

    this.body.unshift(head);
    return head;
  }

  popTail() {
    this.body.pop();
  }

  checkCollision(): boolean {
    const head = this.body[0];

    // Self collision only (Wall collision removed for lower difficulty)
    for (let i = 1; i < this.body.length; i++) {
      if (head.x === this.body[i].x && head.y === this.body[i].y) {
        return true;
      }
    }

    return false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.body.forEach((segment, index) => {
      const ratio = 1 - index / this.body.length;
      // Gradient color: Head is deep red, tail is light pink
      const r = Math.floor(185 + (252 - 185) * (1 - ratio));
      const g = Math.floor(28 + (165 - 28) * (1 - ratio));
      const b = Math.floor(28 + (165 - 28) * (1 - ratio));
      
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      
      // Draw rounded segments
      const radius = index === 0 ? 6 : 4;
      ctx.beginPath();
      ctx.roundRect(segment.x + 1, segment.y + 1, GRID_SIZE - 2, GRID_SIZE - 2, radius);
      ctx.fill();

      // Add a small detail to the head
      if (index === 0) {
        ctx.fillStyle = 'white';
        // Simple eyes
        if (this.direction === 'RIGHT' || this.direction === 'LEFT') {
          ctx.fillRect(segment.x + 12, segment.y + 4, 3, 3);
          ctx.fillRect(segment.x + 12, segment.y + 12, 3, 3);
        } else {
          ctx.fillRect(segment.x + 4, segment.y + 12, 3, 3);
          ctx.fillRect(segment.x + 12, segment.y + 12, 3, 3);
        }
      }
    });
  }
}

// --- Main Component ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  
  // Game instance refs to avoid re-renders
  const snakeRef = useRef<Snake | null>(null);
  const foodRef = useRef<Food | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const speedRef = useRef<number>(INITIAL_SPEED);

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    snakeRef.current = new Snake(GRID_SIZE * 5, GRID_SIZE * 5);
    foodRef.current = new Food(snakeRef.current.body, canvas.width, canvas.height);
    setScore(0);
    speedRef.current = INITIAL_SPEED;
    lastUpdateTimeRef.current = 0;
  }, []);

  const gameOver = useCallback(() => {
    setGameState('GAMEOVER');
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
  }, []);

  const update = useCallback((timestamp: number) => {
    if (gameState !== 'PLAYING') return;

    if (!lastUpdateTimeRef.current) lastUpdateTimeRef.current = timestamp;
    const elapsed = timestamp - lastUpdateTimeRef.current;

    if (elapsed > speedRef.current) {
      const snake = snakeRef.current;
      const food = foodRef.current;
      const canvas = canvasRef.current;

      if (snake && food && canvas) {
        const head = snake.move(canvas.width, canvas.height);

        // Check food collision
        if (head.x === food.position.x && head.y === food.position.y) {
          const newScore = score + 1;
          setScore(prev => {
            const updated = prev + 1;
            // Speed up every 10 points
            if (updated > 0 && updated % SCORE_STEP === 0) {
              speedRef.current *= SPEED_INCREMENT_RATIO;
            }
            return updated;
          });
          foodRef.current = new Food(snake.body, canvas.width, canvas.height);
        } else {
          snake.popTail();
        }

        // Check collisions
        if (snake.checkCollision()) {
          gameOver();
          return;
        }
      }
      lastUpdateTimeRef.current = timestamp;
    }

    // Draw
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Draw background pattern (subtle grid)
      ctx.strokeStyle = 'rgba(185, 28, 28, 0.05)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= canvasRef.current.width; x += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasRef.current.height); ctx.stroke();
      }
      for (let y = 0; y <= canvasRef.current.height; y += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasRef.current.width, y); ctx.stroke();
      }

      foodRef.current?.draw(ctx);
      snakeRef.current?.draw(ctx);
    }

    gameLoopRef.current = requestAnimationFrame(update);
  }, [gameState, score, gameOver]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      gameLoopRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, update]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'START' && e.code === 'Space') {
        initGame();
        setGameState('PLAYING');
      } else if (gameState === 'PLAYING') {
        switch (e.key) {
          case 'ArrowUp': case 'w': snakeRef.current?.setDirection('UP'); break;
          case 'ArrowDown': case 's': snakeRef.current?.setDirection('DOWN'); break;
          case 'ArrowLeft': case 'a': snakeRef.current?.setDirection('LEFT'); break;
          case 'ArrowRight': case 'd': snakeRef.current?.setDirection('RIGHT'); break;
        }
      } else if (gameState === 'GAMEOVER') {
        if (e.key.toLowerCase() === 'r') {
          initGame();
          setGameState('PLAYING');
        } else if (e.key.toLowerCase() === 'q') {
          setGameState('START');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, initGame]);

  useEffect(() => {
    if (score > highScore) setHighScore(score);
  }, [score, highScore]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 font-serif relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
         <div className="absolute -top-20 -left-20 w-64 h-64 border-8 border-red-800 rounded-full rotate-45"></div>
         <div className="absolute -bottom-20 -right-20 w-96 h-96 border-4 border-red-800 rounded-full"></div>
      </div>

      {/* Header / Score */}
      <div className="mb-6 text-center z-10">
        <h1 className="text-5xl font-cursive text-red-800 mb-2 tracking-widest">雅韵贪吃蛇</h1>
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tighter text-red-800/60">当前分数</span>
            <span className="text-3xl font-bold text-red-800">{score}</span>
          </div>
          <div className="h-8 w-px bg-red-800/20"></div>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tighter text-red-800/60">最高纪录</span>
            <span className="text-3xl font-bold text-red-800">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Game Canvas Container */}
      <div className="relative chinese-border bg-[#fdfcf0] shadow-2xl rounded-sm overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          className="block"
        />

        {/* Overlay Screens */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#fdfcf0]/90 flex flex-col items-center justify-center text-center p-8"
            >
              <div className="mb-8 relative">
                <div className="absolute -inset-4 border border-red-800/30 rounded-full animate-pulse"></div>
                <Play className="w-16 h-16 text-red-800" />
              </div>
              <h2 className="text-2xl mb-4 text-red-900 font-bold">准备开始</h2>
              <p className="text-red-800/70 mb-8 max-w-xs">
                使用方向键或 WASD 控制移动。每得 10 分，速度将提升。
              </p>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="px-8 py-3 bg-red-800 text-white rounded-full shadow-lg cursor-pointer hover:bg-red-700 transition-colors"
                onClick={() => { initGame(); setGameState('PLAYING'); }}
              >
                按 空格键 开始游戏
              </motion.div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-red-900/10 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <div className="bg-[#fdfcf0] border-4 border-red-800 p-10 rounded-sm shadow-2xl text-center max-w-sm w-full relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-800 text-white px-6 py-1 rounded-full text-sm font-bold">
                  游戏结束
                </div>
                
                <Trophy className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                <h3 className="text-4xl font-bold text-red-800 mb-2">{score}</h3>
                <p className="text-red-800/60 mb-8">最终得分</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => { initGame(); setGameState('PLAYING'); }}
                    className="flex items-center justify-center gap-2 py-3 bg-red-800 text-white rounded-sm hover:bg-red-700 transition-colors"
                  >
                    <RotateCcw size={18} />
                    <span>R 重玩</span>
                  </button>
                  <button
                    onClick={() => setGameState('START')}
                    className="flex items-center justify-center gap-2 py-3 border-2 border-red-800 text-red-800 rounded-sm hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={18} />
                    <span>Q 退出</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer / Instructions */}
      <div className="mt-8 text-red-800/40 text-sm flex gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-800"></div>
          <span>方向键控制</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-800"></div>
          <span>空格键开始</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-800"></div>
          <span>每10分提速</span>
        </div>
      </div>

      {/* Extensibility Notes (Hidden in UI, visible in code) */}
      {/* 
        可扩展方向：
        1. 音效：集成 Web Audio API，在吃食物或游戏结束时播放古筝/琵琶音效。
        2. 难度选择：在开始界面添加“简单/普通/困难”选项，调整初始速度和提速比例。
        3. 皮肤系统：允许玩家选择不同的花朵作为食物，或不同风格的蛇身纹理。
        4. 障碍物：在地图中随机生成“山石”障碍，增加挑战性。
      */}
    </div>
  );
}
