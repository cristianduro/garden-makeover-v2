export abstract class GameState {
  constructor(protected game: object) {}
  abstract enter():          void;
  abstract exit():           void;
  abstract update(dt: number): void;
}
