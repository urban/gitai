import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";
import { compileTemplate } from "./compileTemplate";

describe("compileTemplate", () => {
  it.effect("should compile a template", () =>
    Effect.gen(function* () {
      const template = "Hello, World!";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello, World!");
    }),
  );

  it.effect("should compile a template with variable reference", () =>
    Effect.gen(function* () {
      const template = "Hello, ${name}!";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello, John!");
    }),
  );

  it.effect("should compile a template with multiple variable references", () =>
    Effect.gen(function* () {
      const template = "Hello ${name}! Your age is ${age}.";
      const data = { name: "John", age: 30 };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello John! Your age is 30.");
    }),
  );

  it.effect("should handle missing variable references", () =>
    Effect.gen(function* () {
      const template = "Hello, ${name}!";
      const data = {};
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello, !");
    }),
  );

  it.effect("should reject function call expressions", () =>
    Effect.gen(function* () {
      const template = "Result: ${format(name)}";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data);
      // this test should abort on compilation because function calls are not allowed
      expect(compiled).toBe("Result: JOHN");
    }).pipe(
      Effect.catchTag("TemplateFunctionCallNotAllowedError", (error) => {
        expect(error.placeholder).toBe("${format(name)}");
        return Effect.succeed(error);
      }),
    ),
  );

  it.effect("should evaluate object expressions with default value", () =>
    Effect.gen(function* () {
      const template = 'User: ${name ?? "John Dow"}.';
      const data = { name: "Jonny" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("User: Jonny.");
    }),
  );

  it.effect("should evaluate object expressions with default value", () =>
    Effect.gen(function* () {
      const template = 'User: ${name ?? "John Dow"}.';
      const data = { name: undefined };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("User: John Dow.");
    }),
  );

  it.effect("should evaluate object expressions with default variable value", () =>
    Effect.gen(function* () {
      const template = "User: ${name ?? nickName}.";
      const data = { name: undefined, nickName: "Jonny" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("User: Jonny.");
    }),
  );

  it.effect("should evaluate ternary expressions", () =>
    Effect.gen(function* () {
      const template = 'The result is ${value ? "Yes" : "No"}.';
      const data = { value: true };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("The result is Yes.");
    }),
  );

  it.effect("should evaluate ternary branch variable references", () =>
    Effect.gen(function* () {
      const template = "Role: ${isAdmin ? adminLabel : userLabel}.";
      const data = { isAdmin: true, adminLabel: "Admin", userLabel: "User" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Role: Admin.");
    }),
  );

  it.effect("should support custom placeholder patterns", () =>
    Effect.gen(function* () {
      const template = "Hello, %{name}!";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data, {
        pattern: /%\{\s*([^{}]+?)\s*\}/g,
      });
      expect(compiled).toBe("Hello, John!");
    }),
  );
});

describe("compileTemplate edge cases", () => {
  it.effect("should handle non-finite numbers", () =>
    Effect.gen(function* () {
      const template = "The value is ${value}.";
      const data = { value: Infinity };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("The value is Infinity.");
    }),
  );

  it.effect("should evaluate object expressions with missing variable reference", () =>
    Effect.gen(function* () {
      const template = "User: ${name ?? nickName}.";
      const data = { nickName: "Jon" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("User: Jon.");
    }),
  );

  it.effect("should evaluate object expressions with multiple missing variable references", () =>
    Effect.gen(function* () {
      const template = "User: ${name ?? nickName}.";
      const data = {};
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("User: .");
    }),
  );

  it.effect("should evaluate ternary expressions without valid conditional", () =>
    Effect.gen(function* () {
      const template = 'The result is ${value ? "Yes" : "No"}.';
      const data = { value: undefined };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("The result is No.");
    }),
  );

  it.effect("should evaluate ternary expressions over multiple lines", () =>
    Effect.gen(function* () {
      const template = `The result is %{value
  ? "Yes"
  : "No"}.`.replace("%", "$");

      const data = { value: true };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("The result is Yes.");
    }),
  );

  it.effect("should compile adjacent placeholders", () =>
    Effect.gen(function* () {
      const template = "${greeting}, ${first}${last}!";
      const data = { greeting: "Hello", first: "John", last: "Doe" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello, JohnDoe!");
    }),
  );

  it.effect("should keep falsy values for nullish coalescing expressions", () =>
    Effect.gen(function* () {
      const template = "Count: ${count ?? 10}, Enabled: ${enabled ?? true}.";
      const data = { count: 0, enabled: false };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Count: 0, Enabled: false.");
    }),
  );

  it.effect("should keep unterminated placeholders unchanged", () =>
    Effect.gen(function* () {
      const template = "Hello ${name";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Hello ${name");
    }),
  );

  it.effect("should evaluate direct template literals", () =>
    Effect.gen(function* () {
      const template = "Message: ${`Hello ${name}`}.";
      const data = { name: "Jane" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Message: Hello Jane.");
    }),
  );

  it.effect("should fallback to empty string when nullish default variable does not exist", () =>
    Effect.gen(function* () {
      const template = "Nickname: ${name ?? nickName}.";
      const data = { name: undefined };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Nickname: .");
    }),
  );

  it.effect("should evaluate ternary expressions containing template literals", () =>
    Effect.gen(function* () {
      const template = "The result is ${value ? `Yes ${name}` : `No ${name}`}.";
      const data = { value: true, name: "John" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("The result is Yes John.");
    }),
  );

  it.effect("should allow question marks and colons inside quoted ternary branches", () =>
    Effect.gen(function* () {
      const template = 'Value: ${flag ? "A ? B" : "C : D"}.';
      const data = { flag: true };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Value: A ? B.");
    }),
  );

  it.effect("should reject function call expressions with extra spacing", () =>
    Effect.gen(function* () {
      const template = "Result: ${ format (name) }";
      const data = { name: "John" };
      const compiled = yield* compileTemplate(template, data);
      expect(compiled).toBe("Result: JOHN");
    }).pipe(
      Effect.catchTag("TemplateFunctionCallNotAllowedError", (error) => {
        expect(error.functionName).toBe("format");
        expect(error.placeholder).toBe("${ format (name) }");
        return Effect.succeed(error);
      }),
    ),
  );
});
