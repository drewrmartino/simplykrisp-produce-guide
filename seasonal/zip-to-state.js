// ZIP -> USPS state, from published ZIP code ranges. No API, no key, works offline.
// Ranges are inclusive, checked in order; the first match wins.
window.ZIP_RANGES = [
  [ 'NY',   500,   599], // IRS Holtsville, NY
  [ 'NY',  6390,  6390], // Fishers Island
  [ 'CT',  6000,  6999],
  [ 'MA',  1000,  2799],
  [ 'RI',  2800,  2999],
  [ 'NH',  3000,  3899],
  [ 'ME',  3900,  4999],
  [ 'VT',  5000,  5999],
  [ 'NJ',  7000,  8999],
  [ 'NY', 10000, 14999],
  [ 'PA', 15000, 19699],
  [ 'DE', 19700, 19999],
  [ 'DC', 20000, 20099],
  [ 'VA', 20100, 20199],
  [ 'DC', 20200, 20599],
  [ 'MD', 20600, 21999],
  [ 'VA', 22000, 24699],
  [ 'WV', 24700, 26899],
  [ 'NC', 27000, 28999],
  [ 'SC', 29000, 29999],
  [ 'GA', 30000, 31999],
  [ 'FL', 32000, 34999],
  [ 'AL', 35000, 36999],
  [ 'TN', 37000, 38599],
  [ 'MS', 38600, 39799],
  [ 'GA', 39800, 39999],
  [ 'KY', 40000, 42799],
  [ 'OH', 43000, 45999],
  [ 'IN', 46000, 47999],
  [ 'MI', 48000, 49999],
  [ 'IA', 50000, 52899],
  [ 'WI', 53000, 54999],
  [ 'MN', 55000, 56799],
  [ 'SD', 57000, 57799],
  [ 'ND', 58000, 58899],
  [ 'MT', 59000, 59999],
  [ 'IL', 60000, 62999],
  [ 'MO', 63000, 65899],
  [ 'KS', 66000, 67999],
  [ 'NE', 68000, 69399],
  [ 'LA', 70000, 71499],
  [ 'AR', 71600, 72999],
  [ 'OK', 73000, 73199],
  [ 'TX', 73300, 73399],
  [ 'OK', 73400, 74999],
  [ 'TX', 75000, 79999],
  [ 'CO', 80000, 81699],
  [ 'WY', 82000, 83199],
  [ 'ID', 83200, 83899],
  [ 'UT', 84000, 84799],
  [ 'AZ', 85000, 86599],
  [ 'NM', 87000, 88499],
  [ 'TX', 88500, 88599],
  [ 'NV', 88900, 89899],
  [ 'CA', 90000, 96199],
  [ 'HI', 96700, 96899],
  [ 'OR', 97000, 97999],
  [ 'WA', 98000, 99499],
  [ 'AK', 99500, 99999],
];

window.STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'Washington, D.C.',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};

window.zipToState = function (zip) {
  const n = parseInt(String(zip).replace(/\D/g, '').slice(0, 5), 10);
  if (!Number.isFinite(n)) return null;
  for (const [state, lo, hi] of window.ZIP_RANGES) {
    if (n >= lo && n <= hi) return state;
  }
  return null;
};
