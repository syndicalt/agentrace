export type DiffLine = {
  kind: "eq" | "add" | "del";
  left?: string;
  right?: string;
};

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}

export function diffLines(leftText: string, rightText: string): DiffLine[] {
  const a = leftText.split("\n");
  const b = rightText.split("\n");
  const table = lcsTable(a, b);

  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift({ kind: "eq", left: a[i - 1], right: b[j - 1] });
      i--;
      j--;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      result.unshift({ kind: "del", left: a[i - 1] });
      i--;
    } else {
      result.unshift({ kind: "add", right: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    result.unshift({ kind: "del", left: a[i - 1] });
    i--;
  }
  while (j > 0) {
    result.unshift({ kind: "add", right: b[j - 1] });
    j--;
  }
  return result;
}

export function prettyJson(str: string | null | undefined): string {
  if (!str) return "";
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
