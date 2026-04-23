import { Effect, Schema } from "effect";

/** Allowed primitive values for template variable substitution. */
type TemplateValues = string | number | boolean | null | undefined;

/** Dictionary of template variables keyed by placeholder name. */
type TemplateVars = Readonly<Record<string, TemplateValues>>;

/**
 * Error raised when a template expression attempts to call a function.
 * Function calls are disallowed to keep templates purely declarative.
 */
class TemplateFunctionCallNotAllowedError extends Schema.TaggedErrorClass<TemplateFunctionCallNotAllowedError>()(
  "TemplateFunctionCallNotAllowedError",
  {
    functionName: Schema.String,
    placeholder: Schema.String,
  },
) {}

/** Parsed placeholder location and expression within a template string. */
type TemplateMatch = Readonly<{
  placeholder: string;
  expression: string;
  start: number;
  end: number;
}>;

/** Returns true when a string is wrapped by the provided quote character. */
const isQuotedBy = (value: string, quote: string) =>
  value.startsWith(quote) && value.endsWith(quote);

/**
 * Interpolates ${var} segments inside a template literal, using provided vars.
 * Missing variables resolve to empty strings.
 */
const interpolateTemplateLiteral = (str: string, vars: TemplateVars) =>
  str.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (_, key: string) => String(vars[key] ?? ""));

/**
 * Extracts a literal value from a quoted string.
 * Supports single, double, and template-literal quotes.
 */
const extractLiteral = (str: string, vars: TemplateVars): string | undefined => {
  if (str.length < 2) return undefined;
  if (isQuotedBy(str, '"') || isQuotedBy(str, "'")) return str.slice(1, -1);
  if (isQuotedBy(str, "`")) {
    return interpolateTemplateLiteral(str.slice(1, -1), vars);
  }
  return undefined;
};

/**
 * Finds the first top-level occurrence of an operator, ignoring quoted segments.
 * Returns -1 when the operator is not found.
 */
const findTopLevelOperatorIndex = (value: string, operator: string): number => {
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (value.startsWith(operator, i)) return i;
  }

  return -1;
};

/**
 * Splits a nullish coalescing expression (`a ?? b`) at the top level.
 * Returns undefined when no top-level `??` exists.
 */
const splitNullishExpression = (
  value: string,
): readonly [left: string, right: string] | undefined => {
  const index = findTopLevelOperatorIndex(value, "??");
  if (index < 0) return undefined;
  return [value.slice(0, index), value.slice(index + 2)];
};

/**
 * Splits a ternary expression (`cond ? a : b`) at the top level.
 * Returns undefined when no top-level ternary exists.
 */
const splitTernaryExpression = (
  value: string,
):
  | Readonly<{
      condition: string;
      whenTrue: string;
      whenFalse: string;
    }>
  | undefined => {
  const questionMarkIndex = findTopLevelOperatorIndex(value, "?");
  if (questionMarkIndex < 0) return undefined;

  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let nestedTernaryDepth = 0;

  for (let i = questionMarkIndex + 1; i < value.length; i++) {
    const char = value[i];

    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "?") {
      nestedTernaryDepth += 1;
      continue;
    }

    if (char === ":") {
      if (nestedTernaryDepth === 0) {
        return {
          condition: value.slice(0, questionMarkIndex),
          whenTrue: value.slice(questionMarkIndex + 1, i),
          whenFalse: value.slice(i + 1),
        };
      }
      nestedTernaryDepth -= 1;
    }
  }

  return undefined;
};

/**
 * Finds `${...}` placeholders in a template while respecting quoted segments.
 * Used when no custom pattern is provided.
 */
const parseDefaultMatches = (template: string): ReadonlyArray<TemplateMatch> => {
  const matches: TemplateMatch[] = [];

  let cursor = 0;
  while (cursor < template.length) {
    const start = template.indexOf("${", cursor);
    if (start < 0) break;

    let quote: "'" | '"' | "`" | null = null;
    let escaped = false;
    let i = start + 2;

    while (i < template.length) {
      const char = template[i];

      if (quote !== null) {
        if (escaped) {
          escaped = false;
          i += 1;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          i += 1;
          continue;
        }
        if (char === quote) {
          quote = null;
          i += 1;
          continue;
        }
        i += 1;
        continue;
      }

      if (char === "'" || char === '"' || char === "`") {
        quote = char;
        i += 1;
        continue;
      }

      if (char === "}") {
        const end = i + 1;
        const placeholder = template.slice(start, end);
        const expression = template.slice(start + 2, i).trim();
        matches.push({ placeholder, expression, start, end });
        cursor = end;
        break;
      }

      i += 1;
    }

    if (i >= template.length) break;
  }

  return matches;
};

/**
 * Compiles a string template by substituting placeholders from `vars`.
 *
 * Supported expressions:
 * - Direct variable reference: `${name}`
 * - Nullish coalescing: `${name ?? "fallback"}`
 * - Ternary: `${isEnabled ? "on" : "off"}`
 *
 * Function calls are rejected and produce `TemplateFunctionCallNotAllowedError`.
 */
const compileTemplate = (
  template: string,
  vars: TemplateVars,
  opts?: {
    readonly pattern?: RegExp;
  },
) =>
  Effect.gen(function* () {
    const pattern = opts?.pattern;

    const hasValidKey = (key: string) => Object.prototype.hasOwnProperty.call(vars, key);

    const evaluateAtom = (value: string) => {
      const token = value.trim();
      if (hasValidKey(token)) return String(vars[token] ?? "");
      const literal = extractLiteral(token, vars);
      return literal ?? "";
    };

    const matches = pattern
      ? Array.from(template.matchAll(pattern)).map((match) => {
          const start = match.index ?? 0;
          return {
            placeholder: match[0],
            expression: (match[1] ?? "").trim(),
            start,
            end: start + match[0].length,
          } satisfies TemplateMatch;
        })
      : parseDefaultMatches(template);

    let output = "";
    let cursor = 0;

    for (const match of matches) {
      output += template.slice(cursor, match.start);
      cursor = match.end;

      // error on function calls
      const functionMatch = match.expression.match(/(\b\w+\s*)\(/);
      if (functionMatch !== null) {
        const functionName = functionMatch[1]?.trim() ?? "";
        return yield* TemplateFunctionCallNotAllowedError.make({
          functionName,
          placeholder: match.placeholder,
        });
      }

      const nullishSplit = splitNullishExpression(match.expression);
      if (nullishSplit !== undefined) {
        const [leftRaw, rightRaw] = nullishSplit;
        const left = leftRaw.trim();
        const leftValue = vars[left];
        if (leftValue !== null && leftValue !== undefined) {
          output += String(leftValue);
          continue;
        }
        output += evaluateAtom(rightRaw);
        continue;
      }

      const ternarySplit = splitTernaryExpression(match.expression);
      if (ternarySplit !== undefined) {
        const conditionKey = ternarySplit.condition.trim();
        const conditionValue = vars[conditionKey];
        output += evaluateAtom(conditionValue ? ternarySplit.whenTrue : ternarySplit.whenFalse);
        continue;
      }

      output += evaluateAtom(match.expression);
    }

    output += template.slice(cursor);
    return output;
  });

export { compileTemplate, TemplateFunctionCallNotAllowedError, type TemplateVars };
