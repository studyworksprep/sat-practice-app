import { usesNewSignupPrice as usesNewStudentPrice } from './signup-pricing.mjs';
export { SIGNUP_PRICE_CUTOFF as STUDENT_PRICE_CUTOFF, usesNewSignupPrice as usesNewStudentPrice } from './signup-pricing.mjs';
export function studentPriceLabel(createdAt) {
  return usesNewStudentPrice(createdAt) ? '$28.99' : '$12.99';
}
// Separate Stripe catalog price; never replace the legacy environment variable.
export const NEW_STUDENT_PRICE_ID = 'price_1UYbGjLvbvAbthFETstrZ28v';
export function studentCheckoutItem(legacyPriceId, createdAt) {
  return {
    price: usesNewStudentPrice(createdAt) ? NEW_STUDENT_PRICE_ID : legacyPriceId,
    quantity: 1,
  };
}
