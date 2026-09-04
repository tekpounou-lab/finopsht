export class BranchNormalizer {
  public static normalize(name: string): string {
    if (!name) return "";
    return name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, " "); // Remove duplicate spaces
  }

  public static getCanonicalId(name: string): string {
    return this.normalize(name).replace(/[^a-z0-9]/g, "");
  }
}
