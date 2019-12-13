export default class AbortEffectsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AbortEffectsError";
  }
}
