export abstract class GameState {
  constructor(protected _game: object) {}
  abstract enter():          void;
  abstract exit():           void;
  abstract update(dt: number): void;
}
