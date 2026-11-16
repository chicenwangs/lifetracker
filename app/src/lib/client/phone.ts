// Phone layout test for script (CSS uses the same rule). #110 widens it to short touch screens (landscape).
export const PHONE_MQ = '(max-width: 699px)';
export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE_MQ).matches;
