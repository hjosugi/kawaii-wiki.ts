/**
 * Password hashing — thin wrappers over Bun's built-in bcrypt. Zero deps.
 */
export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 })

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  Bun.password.verify(password, hash)
