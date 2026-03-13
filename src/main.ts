import './style.css';
import { Game } from './core/Game';

const container = document.getElementById('app')!;
const game = new Game(container);
game.start().catch(console.error);
(window as any)._game = game;
