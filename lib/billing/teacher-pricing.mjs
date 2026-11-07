import { usesNewSignupPrice } from './signup-pricing.mjs';

// Keep STRIPE_TEACHER_PRICE_ID pointing to the legacy teacher price.
export const NEW_TEACHER_PRICE_ID = 'price_1UZ9LNLvbvAbthFEuHDLEr2e';
export function teacherCheckoutItem(legacyPriceId, createdAt) {
  return {
    price: usesNewSignupPrice(createdAt) ? NEW_TEACHER_PRICE_ID : legacyPriceId,
    quantity: 1,
  };
}

export function teacherPriceLabel(createdAt) {
  return usesNewSignupPrice(createdAt) ? '$39.99' : '$29.99';
}
