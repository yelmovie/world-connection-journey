import type PhaserNS from 'phaser';

export const GAME_W = 1280;
export const GAME_H = 720;

export interface PhaserHost {
  game: PhaserNS.Game;
  destroy(): void;
}

/**
 * 페이지당 1개의 Phaser 인스턴스를 생성/파괴한다.
 * phaser 청크는 실제 사용 페이지에서만 동적 로드된다.
 * destroy(true) 시 씬·텍스처·리스너가 함께 정리된다.
 */
export async function createPhaserHost(
  parent: HTMLElement,
  sceneFactory: (P: typeof PhaserNS) => PhaserNS.Scene
): Promise<PhaserHost> {
  const Phaser = (await import('phaser')).default;
  const scene = sceneFactory(Phaser);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_W,
      height: GAME_H
    },
    render: { antialias: true },
    scene
  });
  return {
    game,
    destroy() {
      game.destroy(true);
    }
  };
}
