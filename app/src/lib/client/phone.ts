// Phone layout = narrow, or a short touch screen (phone turned sideways, #110). CSS uses the same rule:
// @media (max-width: 699px), (pointer: coarse) and (max-height: 500px). Tablets (taller than 500) keep desktop.
export const PHONE_MQ = '(max-width: 699px), (pointer: coarse) and (max-height: 500px)';
export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE_MQ).matches;
