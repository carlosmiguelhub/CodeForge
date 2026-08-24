export const PASSWORD_MIN_LENGTH = 8;
const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9]/;

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!SPECIAL_CHARACTER_PATTERN.test(password))
    return "Include at least one special character (e.g. ! @ # $ %).";
  return null;
}
