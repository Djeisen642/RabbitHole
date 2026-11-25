/**
 * Made-up Reddit content for tests and the local mock server. Every post,
 * comment and rule here was written for this file; the communities are real
 * pool entries but nothing is copied from them, and the authors are
 * placeholders, not real accounts. All of it is safe for work.
 *
 * Each community has one or two puzzle-ready text posts (with top comments)
 * and a few short text posts that only feed the jargon clue and the "enough
 * text posts" check.
 */

export type FixtureComment = {
  author: string;
  body: string;
  score: number;
  stickied?: boolean;
  distinguished?: boolean;
};

export type FixturePost = {
  id: string;
  title: string;
  body: string;
  score: number;
  comments: number;
  daysAgo: number;
  flair?: string;
  /** Defaults to true. False models a link, image or video post. */
  isSelf?: boolean;
  nsfw?: boolean;
  topComments?: FixtureComment[];
};

export type FixtureSub = {
  name: string;
  subscribers: number;
  createdYear: number;
  iconUrl: string | null;
  nsfw?: boolean;
  quarantined?: boolean;
  rules: { title: string; description: string }[];
  posts: FixturePost[];
};

/** Fixture dates count back from this instant. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 24, 12);

const svgIcon = (body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#f3d9b1"/>${body}</svg>`
  )}`;

const AUTOMOD: FixtureComment = {
  author: 'AutoModerator',
  body: 'Thanks for posting! Please remember to read the rules before commenting.',
  score: 1,
  stickied: true,
  distinguished: true,
};

const filler = (
  id: string,
  title: string,
  daysAgo: number,
  flair?: string
): FixturePost => ({
  id,
  title,
  body: 'Short update, more details in the comments if anyone is curious.',
  score: 40 + daysAgo * 7,
  comments: 6,
  daysAgo,
  ...(flair ? { flair } : {}),
});

export const FIXTURES: readonly FixtureSub[] = [
  {
    name: 'Breadit',
    subscribers: 1_240_000,
    createdYear: 2011,
    iconUrl: svgIcon(
      '<path d="M14 38c0-12 8-18 18-18s18 6 18 18v8H14z" fill="#c9803f" stroke="#6b3d16" stroke-width="3"/><path d="M24 28l4 6M32 26l4 6M40 28l4 6" stroke="#6b3d16" stroke-width="2.5" stroke-linecap="round"/>'
    ),
    rules: [
      {
        title: 'Be kind',
        description:
          'Everyone started somewhere. Critique the loaf, not the baker.',
      },
      {
        title: 'Share your recipe',
        description:
          'If you post a bake, include the recipe or the method in a comment within an hour, or the post may be removed.',
      },
      {
        title: 'No selling',
        description: 'Posts promoting a bakery or a shop are not allowed.',
      },
    ],
    posts: [
      {
        id: 't3_mockbr1',
        title:
          'Third attempt at a 75% hydration loaf and I finally got an open crumb',
        body: 'The first two came out like bricks because I rushed the bulk ferment. This time I let it go almost six hours in my cold kitchen, did four sets of stretch and folds, and shaped it with a lot more tension. Baked in a dutch oven at 250C with the lid on for 20 minutes. The ear is still shy but I am weirdly proud of this one.',
        score: 4820,
        comments: 212,
        daysAgo: 3,
        topComments: [
          AUTOMOD,
          {
            author: 'example_user_1',
            body: 'That crumb is gorgeous. Next time try a slightly steeper scoring angle, almost flat against the dough, and the ear will open right up.',
            score: 1311,
          },
        ],
      },
      {
        id: 't3_mockbr2',
        title: 'My starter turned two today, so I baked it a birthday boule',
        body: 'Two years ago I mixed flour and water in a jar because everyone online was doing it. It has survived a move, a week in the back of the fridge and one very sad hooch incident. To celebrate I baked a rye and spelt boule with a little honey. Pictures do not do the crust justice, it crackled for ten minutes while it cooled.',
        score: 3105,
        comments: 98,
        daysAgo: 9,
        topComments: [
          {
            author: 'example_user_2',
            body: 'Happy birthday to the little yeast colony. Mine is named Clint Yeastwood and he is three in March.',
            score: 902,
          },
        ],
      },
      filler(
        't3_mockbr3',
        'Why does my crumb go gummy when the loaf looks done?',
        5
      ),
      filler('t3_mockbr4', 'Focaccia dimpling tips? Mine always deflates', 12),
      filler('t3_mockbr5', 'Rye starter vs wheat starter for a first loaf', 18),
      filler('t3_mockbr6', 'Best scoring lame for a beginner', 22),
      filler(
        't3_mockbr7',
        'Joined r/Breadit last month, here is my progress',
        2
      ),
    ],
  },
  {
    name: 'houseplants',
    subscribers: 3_180_000,
    createdYear: 2009,
    iconUrl: null,
    rules: [
      {
        title: 'Be civil',
        description: 'No personal attacks or harassment.',
      },
      {
        title: 'Identification requests go in the weekly thread',
        description:
          'Single photos asking what a plant is will be removed. Use the pinned weekly thread instead.',
      },
    ],
    posts: [
      {
        id: 't3_mockhp1',
        title:
          'Rescued this monstera from a curb and six months later it is unrecognisable',
        body: 'Someone left it outside their building with a single yellow leaf and roots coming out of the drainage holes. I repotted it into a chunky aroid mix, gave it a moss pole and put it by an east window. It has pushed out nine new leaves and the last three have fenestrations. My partner says it is now the main character of our living room.',
        score: 6220,
        comments: 187,
        daysAgo: 4,
        topComments: [
          {
            author: 'example_user_3',
            body: 'The moss pole was the move. Once they have something to climb the leaves get bigger and the splits come in fast.',
            score: 1876,
          },
        ],
      },
      filler('t3_mockhp2', 'Fungus gnats are winning, what actually works?', 6),
      filler(
        't3_mockhp3',
        'Is this much aerial root normal for a monstera?',
        10
      ),
      filler('t3_mockhp4', 'Pothos propagation station on my windowsill', 15),
      filler(
        't3_mockhp5',
        'Bottom watering vs top watering for a calathea',
        20
      ),
    ],
  },
  {
    name: 'MechanicalKeyboards',
    subscribers: 1_350_000,
    createdYear: 2010,
    iconUrl: svgIcon(
      '<rect x="12" y="22" width="40" height="22" rx="4" fill="#fff" stroke="#3b2719" stroke-width="3"/><path d="M18 30h4M26 30h4M34 30h4M42 30h4M22 37h20" stroke="#3b2719" stroke-width="3" stroke-linecap="round"/>'
    ),
    rules: [
      {
        title: 'No low effort posts',
        description: 'Posts must contribute something to the community.',
      },
      {
        title: 'Include a parts list',
        description:
          'Build posts must list the case, switches, keycaps and plate in a comment or the post body.',
      },
    ],
    posts: [
      {
        id: 't3_mockmk1',
        title:
          'Lubed 90 linear switches by hand over three evenings and the sound is worth it',
        body: 'Started with stock linears that sounded like a bag of marbles. Opened every one, applied a thin coat to the stems and springs, added films, and put them back in a gasket mount aluminium case with a polycarbonate plate. Now it is a deep, muted thock instead of a clack. My hands hurt but I would do it again. Keycaps are thick PBT with a cherry profile.',
        score: 2980,
        comments: 341,
        daysAgo: 2,
        topComments: [
          {
            author: 'example_user_4',
            body: 'Three evenings for 90 switches is honestly fast. Welcome to the club where your keyboard costs more than your computer.',
            score: 1544,
          },
        ],
      },
      {
        id: 't3_mockmk2',
        title:
          'Found my first board from 1989 in my parents attic and it still types',
        body: 'Big beige beast with buckling springs, coiled cable and a key that says Print Screen on two lines. Cleaned the caps in warm soapy water, blew the dust out of the case and plugged it in through an adapter. Every key works. It is louder than my dishwasher and I love it. My roommate does not.',
        score: 2105,
        comments: 176,
        daysAgo: 11,
        topComments: [
          {
            author: 'example_user_5',
            body: 'Those things were built to survive the apocalypse. Your roommate will learn to love the sound, or move out.',
            score: 733,
          },
        ],
      },
      filler('t3_mockmk3', 'Tactile or linear switches for a first build?', 7),
      filler(
        't3_mockmk4',
        'Which keycaps profile is easiest on the wrists?',
        13
      ),
      filler('t3_mockmk5', 'Gasket mount case recommendations under 150', 19),
    ],
  },
  {
    name: 'castiron',
    subscribers: 760_000,
    createdYear: 2010,
    iconUrl: null,
    rules: [
      {
        title: 'Be respectful',
        description: 'No insults or personal attacks.',
      },
      {
        title: 'Do not ask if it is ruined',
        description:
          'It almost certainly is not ruined. Search the wiki on rust and stripping before posting.',
      },
    ],
    posts: [
      {
        id: 't3_mockci1',
        title:
          'Paid five dollars at an estate sale for a crusty skillet, two weeks of work later',
        body: 'It came out of a barn caked in rust and decades of carbon. Lye bath for a week, a short vinegar soak, then scrubbed with steel wool and dried in the oven. Six thin coats of seasoning at high heat. The bottom has a maker mark I did not even know was there. First thing I cooked was a fried egg and it slid right off.',
        score: 5410,
        comments: 233,
        daysAgo: 6,
        topComments: [
          AUTOMOD,
          {
            author: 'example_user_6',
            body: 'Five dollars and a little elbow grease for a pan your grandkids will fight over. The egg slide is the best feeling.',
            score: 1920,
          },
        ],
      },
      filler(
        't3_mockci2',
        'Is this skillet ruined? Left it soaking overnight',
        3
      ),
      filler('t3_mockci3', 'Seasoning keeps flaking, what oil do you use?', 8),
      filler(
        't3_mockci4',
        'Lye bath vs oven cleaner for stripping old seasoning',
        14
      ),
      filler('t3_mockci5', 'Thrift store skillet haul, which one first?', 21),
    ],
  },
  {
    name: 'whatisthisthing',
    subscribers: 2_600_000,
    createdYear: 2010,
    iconUrl: svgIcon(
      '<circle cx="28" cy="28" r="12" fill="none" stroke="#3b2719" stroke-width="4"/><path d="M37 37l12 12" stroke="#3b2719" stroke-width="5" stroke-linecap="round"/>'
    ),
    rules: [
      {
        title: 'No spam',
        description: 'Self promotion and spam are removed.',
      },
      {
        title: 'Reply Solved! when you get an answer',
        description:
          'Reply to the correct answer with the word Solved! so the bot can flair the post.',
      },
    ],
    posts: [
      {
        id: 't3_mockwt1',
        title:
          'Heavy brass gadget with a crank and teeth, found in my late grandfather’s workshop',
        body: 'About the size of a coffee mug and surprisingly heavy. There is a hand crank on one side, a row of small steel teeth inside, and a clamp on the bottom like it was meant to be screwed onto the edge of a table. No markings except a number stamped near the crank. He was a farmer and a tinkerer, so it could honestly be anything.',
        score: 7810,
        comments: 412,
        daysAgo: 5,
        topComments: [
          {
            author: 'example_user_7',
            body: 'That looks like an old apple peeler and corer. You spike the apple on the end, turn the crank and the blade spirals around it.',
            score: 4102,
          },
        ],
      },
      {
        id: 't3_mockwt2',
        title:
          'Small wooden box with twelve tiny drawers, each lined with velvet',
        body: 'Bought it at a flea market for the drawers alone. Each one is about the size of a matchbox and lined with faded green velvet. There is a brass plate on the lid that has been polished smooth so I cannot read it. The seller said it came from an old shop in the town centre. Jewellery? Watch parts? Seeds?',
        score: 3320,
        comments: 205,
        daysAgo: 14,
        topComments: [
          {
            author: 'example_user_8',
            body: 'Watchmaker parts cabinet. The velvet keeps the tiny screws and jewels from rolling around and getting lost.',
            score: 1588,
          },
        ],
      },
      filler(
        't3_mockwt3',
        'Metal ring with a hinge found while metal detecting',
        4
      ),
      filler('t3_mockwt4', 'Strange glass object found buried in my garden', 9),
      filler(
        't3_mockwt5',
        'Weird wooden tool with a hinge, maybe for leather?',
        16
      ),
    ],
  },
  {
    name: 'birding',
    subscribers: 980_000,
    createdYear: 2008,
    iconUrl: svgIcon(
      '<path d="M16 40c4-14 18-20 30-12l6-2-4 6c0 10-10 16-22 14z" fill="#fff" stroke="#3b2719" stroke-width="3"/><circle cx="42" cy="30" r="2" fill="#3b2719"/>'
    ),
    rules: [
      {
        title: 'No baiting or disturbing birds',
        description:
          'Photos that show birds being baited, flushed or approached at the nest will be removed.',
      },
      {
        title: 'Include a location',
        description:
          'Give at least the region for identification posts, because range matters.',
      },
    ],
    posts: [
      {
        id: 't3_mockbd1',
        title: 'Lifer! Waited two hours in the cold and the owl finally showed',
        body: 'There had been reports of a great grey owl at the edge of a meadow near me for a week. I went out at dawn with my binoculars and a thermos, stood very still in the snow and saw nothing for two hours. Just as my toes went numb it glided out of the treeline and landed on a fence post maybe forty metres away. I forgot to breathe. Added to my life list with shaking hands.',
        score: 3990,
        comments: 144,
        daysAgo: 7,
        topComments: [
          {
            author: 'example_user_9',
            body: 'Great greys are the best reward for patience. Congrats on the lifer, and well done keeping your distance.',
            score: 1203,
          },
        ],
      },
      filler('t3_mockbd2', 'First warbler of the season, lifer for me', 2),
      filler('t3_mockbd3', 'Which binoculars for a beginner on a budget?', 12),
      filler('t3_mockbd4', 'Is this a hawk or a falcon? Help with ID', 17),
      filler('t3_mockbd5', 'My yard list hit 50 species today', 23),
    ],
  },
  {
    name: 'bicycletouring',
    subscribers: 310_000,
    createdYear: 2009,
    iconUrl: null,
    rules: [
      {
        title: 'Be respectful',
        description: 'Treat others the way you want to be treated.',
      },
      {
        title: 'Trip reports need details',
        description:
          'Tell us the route, the distance and the gear. A photo with no story will be removed.',
      },
    ],
    posts: [
      {
        id: 't3_mockbt1',
        title:
          'Finished 3,000 km across the country on a 20 year old steel frame',
        body: 'Seven weeks, four panniers, two flat tyres and one broken spoke that a farmer helped me fix with wire. I camped most nights, ate my weight in peanut butter and learned that headwinds are personal. The bike cost me 80 dollars second hand and I swapped in a wider gearing range before leaving. It never once let me down. Already planning the next route.',
        score: 2210,
        comments: 120,
        daysAgo: 8,
        topComments: [
          {
            author: 'example_user_10',
            body: 'Old steel frames are the cockroaches of the cycling world. Respect for the headwind stoicism, they really are personal.',
            score: 640,
          },
        ],
      },
      filler(
        't3_mockbt2',
        'Panniers or bikepacking bags for a gravel route?',
        5
      ),
      filler('t3_mockbt3', 'Wild camping etiquette on a long route', 11),
      filler(
        't3_mockbt4',
        'Gearing for loaded climbs, what range do you run?',
        18
      ),
      filler('t3_mockbt5', 'Best tyres for a mixed route, gravel and road', 24),
    ],
  },
  {
    name: 'canada',
    subscribers: 3_900_000,
    createdYear: 2008,
    iconUrl: svgIcon(
      '<path d="M32 12l4 10 8-4-2 12 8 2-10 8 2 6-10-2v10h-0v-10l-10 2 2-6-10-8 8-2-2-12 8 4z" fill="#d52b1e"/>'
    ),
    rules: [
      {
        title: 'No personal attacks',
        description: 'Attack the argument, not the person.',
      },
      {
        title: 'Use the original headline',
        description:
          'Article titles must match the source headline. Editorialised titles will be removed.',
      },
    ],
    posts: [
      {
        id: 't3_mockca1',
        title:
          'Saw the northern lights from my backyard in Manitoba for the first time in 30 years here',
        body: 'Lived in the same town my whole life and somehow always missed them. Last night my neighbour knocked on the door at midnight and told me to look up. Green curtains across the whole sky, with a little pink at the edges, moving like someone was shaking out a bedsheet. Stood on the frozen lawn in my slippers for an hour. Minus 28 and worth every second.',
        score: 9100,
        comments: 377,
        daysAgo: 3,
        topComments: [
          {
            author: 'example_user_11',
            body: 'Minus 28 in slippers is the most prairie thing I have ever read. Good on your neighbour for the wake-up call.',
            score: 2880,
          },
        ],
      },
      {
        id: 't3_mockca2',
        title: 'Provincial election turnout numbers are out',
        body: 'Turnout came in a little higher than last time according to the early figures. Full breakdown by riding is expected later this week once all the advance ballots are counted.',
        score: 5200,
        comments: 900,
        daysAgo: 4,
        flair: 'Politics',
        topComments: [
          {
            author: 'example_user_12',
            body: 'Glad to see more people showing up, whatever the result ends up being.',
            score: 800,
          },
        ],
      },
      filler('t3_mockca3', 'Winter tyres before the first snow, or wait?', 6),
      filler(
        't3_mockca4',
        'Road trip from the prairies to the coast, must sees?',
        13
      ),
      filler(
        't3_mockca5',
        'Tim Hortons double double or something better?',
        20
      ),
    ],
  },
  {
    // Too small for the minimum member count, so the picker and the pool
    // check skip it.
    name: 'Lighthouses',
    subscribers: 12_400,
    createdYear: 2012,
    iconUrl: null,
    rules: [
      { title: 'Lighthouses only', description: 'Posts must feature one.' },
    ],
    posts: [
      filler('t3_mocklh1', 'A foggy morning at the point', 2),
      filler('t3_mocklh2', 'Climbed all 200 steps today', 9),
      filler('t3_mocklh3', 'Restored lens from 1890', 15),
    ],
  },
];
