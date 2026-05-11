const ignoredFileNames = new Set([
  ".DS_Store",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const ignoredDirectoryNames = new Set([".git", ".next", "build", "dist", "node_modules"]);

const ignoredCoverageFiles = new Set(["coverage-final.json", "coverage-summary.json"]);

const diffHeaderPattern = /^diff --git a\/(.+) b\/(.+)$/m;

const splitDiffSections = (diffText: string) => {
  const sections = diffText.split(/(?=^diff --git )/gm);

  return sections[0] === "" ? sections.slice(1) : sections;
};

const getSectionPaths = (section: string): ReadonlyArray<string> => {
  const match = diffHeaderPattern.exec(section);
  const oldPath = match?.[1];
  const newPath = match?.[2];

  return oldPath === undefined || newPath === undefined ? [] : [oldPath, newPath];
};

const pathSegments = (filePath: string) => filePath.split("/");

const isIgnoredDiffSection = (section: string) => {
  const sectionPaths = getSectionPaths(section);

  return sectionPaths.some(isIgnoredDiffPath);
};

export const isIgnoredDiffPath = (filePath: string): boolean => {
  const segments = pathSegments(filePath);
  const basename = segments.at(-1);

  if (basename === undefined) {
    return false;
  }

  if (ignoredFileNames.has(basename) || ignoredCoverageFiles.has(basename)) {
    return true;
  }

  if (segments.includes("coverage") && basename.endsWith(".json")) {
    return true;
  }

  return segments.some((segment) => ignoredDirectoryNames.has(segment));
};

export const getIgnoredDiffSectionHeaders = (diffText: string): ReadonlyArray<string> =>
  splitDiffSections(diffText)
    .filter(isIgnoredDiffSection)
    .map((section) => section.split("\n")[0] ?? "")
    .filter((header) => header.length > 0);

export const filterIgnoredDiffSections = (diffText: string): string =>
  splitDiffSections(diffText)
    .filter((section) => !isIgnoredDiffSection(section))
    .join("");
