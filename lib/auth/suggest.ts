// Starting passwords that are easy to read aloud and type on a phone:
// three everyday words, like "maple-fern-lantern". The person who makes an
// account sees this and passes it on; the new person can change it later.
// Pure, so it runs in the browser (the invite forms) and on the server.

// 256 short, common, cheerful words with one obvious spelling, so each word
// is one random byte (no bias) and three of them about 24 bits. Sign-in
// attempts are rate limited per account, which is what keeps that enough.
export const WORDS = [
  'acorn', 'amber', 'anchor', 'apple', 'apron', 'arrow', 'aspen', 'attic', 'badge', 'bagel', 'bamboo', 'banjo',
  'barley', 'basil', 'basket', 'beach', 'beacon', 'beaver', 'berry', 'birch', 'biscuit', 'blanket', 'bloom', 'blue',
  'bonnet', 'branch', 'bread', 'breeze', 'brick', 'brook', 'bubble', 'bucket', 'button', 'cabin', 'cactus', 'camel',
  'candle', 'canoe', 'canyon', 'carrot', 'castle', 'cedar', 'cello', 'cherry', 'chess', 'cider', 'clover', 'cloud',
  'cobalt', 'cocoa', 'comet', 'copper', 'coral', 'cotton', 'cozy', 'crane', 'crayon', 'creek', 'cricket', 'crown',
  'cupcake', 'daisy', 'dancer', 'denim', 'desert', 'dolphin', 'dove', 'dragon', 'drum', 'eagle', 'easel', 'ember',
  'falcon', 'feather', 'fern', 'fiddle', 'field', 'finch', 'firefly', 'flute', 'forest', 'fossil', 'fox', 'garden',
  'garnet', 'ginger', 'glacier', 'glove', 'goose', 'grape', 'gravel', 'guitar', 'hammock', 'harbor', 'harp', 'hazel',
  'heron', 'hickory', 'hill', 'honey', 'horizon', 'iris', 'island', 'ivory', 'ivy', 'jacket', 'jasmine', 'jelly',
  'jewel', 'juniper', 'kayak', 'kettle', 'kitten', 'kiwi', 'koala', 'ladder', 'lagoon', 'lantern', 'lark', 'lava',
  'lemon', 'lilac', 'lily', 'linen', 'lobster', 'lotus', 'magnet', 'mango', 'maple', 'marble', 'meadow', 'melon',
  'mint', 'mitten', 'moon', 'morning', 'moss', 'muffin', 'nectar', 'nest', 'nutmeg', 'oak', 'oasis', 'ocean',
  'olive', 'onion', 'orange', 'orchard', 'orchid', 'otter', 'owl', 'paddle', 'panda', 'pansy', 'paper', 'parrot',
  'peach', 'peanut', 'pearl', 'pebble', 'pecan', 'pelican', 'pepper', 'piano', 'pickle', 'pigeon', 'pillow', 'pine',
  'planet', 'plum', 'pocket', 'poppy', 'potato', 'prairie', 'pretzel', 'puffin', 'pumpkin', 'puzzle', 'quail', 'quilt',
  'rabbit', 'radish', 'rain', 'raven', 'reef', 'ribbon', 'river', 'robin', 'rocket', 'rose', 'ruby', 'saddle',
  'saffron', 'sage', 'sail', 'salmon', 'sandal', 'satin', 'scarf', 'seal', 'shell', 'silver', 'sky', 'sled',
  'snow', 'sparrow', 'spice', 'spruce', 'squash', 'star', 'stone', 'straw', 'stream', 'sugar', 'summer', 'sunset',
  'swan', 'sweater', 'syrup', 'teapot', 'thistle', 'thunder', 'tiger', 'timber', 'toast', 'tomato', 'topaz', 'tulip',
  'tunnel', 'turtle', 'umbrella', 'valley', 'velvet', 'violet', 'violin', 'wagon', 'walnut', 'walrus', 'water', 'whale',
  'wheat', 'willow', 'window', 'winter', 'wizard', 'wren', 'yarn', 'zebra', 'blossom', 'cookie', 'harvest', 'hedgehog',
  'meteor', 'pudding', 'seashell', 'waffle',
] as const;

/** Three different random words joined by dashes. */
export function suggestPassword(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const picked: string[] = [];
  while (picked.length < 3) {
    for (const b of randomBytes(3)) {
      const w = WORDS[b]!;
      if (picked.length < 3 && !picked.includes(w)) picked.push(w);
    }
  }
  return picked.join('-');
}
