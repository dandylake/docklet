import { faker } from "@faker-js/faker";

let seq = 0;

// A monotonic suffix guarantees uniqueness: createUser rejects duplicate
// usernames, and faker can otherwise collide within a single test file.
export function username(): string {
  const base = faker.internet
    .username()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 12);
  return `${base}_${++seq}`;
}

export function password(length = 12): string {
  return faker.internet.password({ length });
}
