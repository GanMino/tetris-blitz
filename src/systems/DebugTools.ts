import GUI from 'lil-gui';
import { TUNING } from '../game/constants';

/** Live tuning panel behind the `?debug` query param (hidden in builds). */
export class DebugTools {
  private gui: GUI | null = null;

  constructor(onChange: () => void) {
    const enabled = new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;

    this.gui = new GUI({ title: 'TETRIS BLITZ tuning' });

    const time = this.gui.addFolder('Time');
    time.add(TUNING.time, 'startSeconds', 30, 300, 5);
    time.add(TUNING.time, 'secondsPerLine', 0, 15, 1);
    time.add(TUNING.time, 'powerupTimeBonus', 2, 20, 1);

    const gravity = this.gui.addFolder('Gravity');
    gravity.add(TUNING.gravity, 'slowMultiplier', 0.2, 1, 0.05);
    for (let i = 0; i < TUNING.gravity.levels.length; i += 1) {
      const level = TUNING.gravity.levels[i];
      gravity.add(level, 'interval', 0.15, 1.5, 0.05).name(`L${i + 1} interval`);
    }

    const powerups = this.gui.addFolder('Power-ups');
    powerups.add(TUNING.powerups, 'chance', 0, 1, 0.01);
    powerups.add(TUNING.powerups, 'chanceLate', 0, 1, 0.01);
    powerups.add(TUNING.powerups, 'slowDuration', 3, 30, 1);
    powerups.add(TUNING.powerups, 'doubleDuration', 3, 30, 1);
    powerups.add(TUNING.powerups, 'bonusPoints', 100, 1000, 50);
    powerups.add(TUNING.powerups, 'bombRows', 1, 4, 1);

    const render = this.gui.addFolder('Render');
    render.add(TUNING.render, 'maxDpr', 1, 2, 0.25).onChange(onChange);
    render.add(TUNING.render, 'exposure', 0.6, 1.8, 0.01).onChange(onChange);
  }

  setHidden(hidden: boolean): void {
    if (!this.gui) return;
    if (hidden) this.gui.hide();
    else this.gui.show();
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
