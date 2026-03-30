import React, { useEffect, useRef } from 'react';

const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: Particle[] = [];
    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const mouse = { x: -1000, y: -1000 };

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      const particleCount = Math.floor((width * height) / 12000); // 适中的粒子密度
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      originalVx: number;
      originalVy: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.8; // 随机缓慢漂移
        this.vy = (Math.random() - 0.5) * 0.8;
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        this.radius = Math.random() * 2 + 0.5;
      }

      update() {
        // 反重力 / 鼠标排斥效果
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const repelRadius = 150;
        if (distance < repelRadius) {
          const forceDirectionX = dx / distance;
          const forceDirectionY = dy / distance;
          const force = (repelRadius - distance) / repelRadius;
          
          this.vx -= forceDirectionX * force * 0.4;
          this.vy -= forceDirectionY * force * 0.4;
        } else {
          // 缓慢恢复原有速度
          this.vx += (this.originalVx - this.vx) * 0.05;
          this.vy += (this.originalVy - this.vy) * 0.05;
        }

        // 引入一点阻尼，防止粒子飞得太快
        this.vx *= 0.99;
        this.vy *= 0.99;

        this.x += this.vx;
        this.y += this.vy;

        // 边界处理：碰到边缘反弹
        if (this.x < 0 || this.x > width) {
          this.vx *= -1;
          this.originalVx *= -1;
          this.x = Math.max(0, Math.min(width, this.x));
        }
        if (this.y < 0 || this.y > height) {
          this.vy *= -1;
          this.originalVy *= -1;
          this.y = Math.max(0, Math.min(height, this.y));
        }
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(156, 163, 175, 0.5)'; // 浅灰色，适配极简背景
        ctx.fill();
      }
    }

    const drawLines = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) { // 粒子在这个距离内互相连线
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const opacity = 1 - distance / 120;
            ctx.strokeStyle = `rgba(156, 163, 175, ${opacity * 0.3})`;
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
      }
      drawLines();
      
      animationFrameId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    init();
    animate();

    window.addEventListener('resize', init);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('resize', init);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none', // 不干扰登录框的点击事件
      }}
    />
  );
};

export default ParticleBackground;
