import { AppController } from './AppController';

const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas not found');

const app = new AppController(canvas);
app.start().catch(e => console.error('Failed to start:', e));

// Expose for debugging
(window as any).app = app;
