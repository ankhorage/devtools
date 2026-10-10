/*** Check whether the declared Devtools caret range includes the executing Devtools release. */
export function isCompatibleDevtoolsRange(range: unknown, version: string): boolean {
  const rangeParts = parseStableVersion(typeof range === 'string' ? range.slice(1) : '');
  const versionParts = parseStableVersion(version);
  if (
    typeof range !== 'string' ||
    !range.startsWith('^') ||
    rangeParts === undefined ||
    versionParts === undefined
  ) {
    return false;
  }
  if (rangeParts.major !== versionParts.major) return false;
  if (rangeParts.major > 0) return compareStableVersions(versionParts, rangeParts) >= 0;
  if (rangeParts.minor !== versionParts.minor) return false;
  if (rangeParts.minor > 0) return versionParts.patch >= rangeParts.patch;
  return versionParts.patch === rangeParts.patch;
}

/*** Parse one stable semantic version used by the managed Devtools range contract. */
function parseStableVersion(
  value: string,
): { readonly major: number; readonly minor: number; readonly patch: number } | undefined {
  const match = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u.exec(value);
  if (match?.groups === undefined) return undefined;
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
  };
}

/*** Compare stable semantic-version tuples. */
function compareStableVersions(
  left: { readonly major: number; readonly minor: number; readonly patch: number },
  right: { readonly major: number; readonly minor: number; readonly patch: number },
): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}
