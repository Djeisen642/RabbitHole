import type { PoolCategory, PoolEntry } from './pool';

/**
 * The curated answer pool. Hand-made, so the daily picker checks every sub at
 * run time (it exists, is SFW, is big enough and has text posts) before using
 * it; a dead or misspelled name here only costs that sub its turn.
 *
 * Aliases are other names people type for a sub (misspellings, spaced
 * versions, abbreviations, a country's demonym), never plain topic words: a
 * title containing an alias is rejected as a giveaway, so "bread" must not be
 * an alias of r/Breadit. `r/`, case, spaces, dashes and underscores never
 * matter (see normalizeSubreddit).
 */

const e = (
  category: PoolCategory,
  name: string,
  aliases: readonly string[] = []
): PoolEntry => ({ name, aliases, category });

const country = (name: string, aliases: readonly string[]): PoolEntry => ({
  name,
  aliases,
  category: 'country',
  newsHeavy: true,
});

export const POOL_DATA: readonly PoolEntry[] = [
  // Food and drink
  e('food', 'Breadit', ['bredit', 'breddit', 'bread it']),
  e('food', 'Sourdough', ['sour dough']),
  e('food', 'castiron', ['cast iron']),
  e('food', 'Cooking', ['cookin']),
  e('food', 'Baking', ['bakeing']),
  e('food', 'Pizza', ['pizzza']),
  e('food', 'Coffee', ['cofee', 'coffe']),
  e('food', 'tea', ['teas']),
  e('food', 'fermentation', ['fermentaion']),
  e('food', 'Pickles', ['pickels']),
  e('food', 'spicy', ['spicey']),
  e('food', 'ramen', ['ramens']),
  e('food', 'grilling', ['griling']),
  e('food', 'BBQ', ['barbecue', 'barbeque']),
  e('food', 'Cheese', ['cheeses']),
  e('food', 'mead', ['meads']),
  e('food', 'Homebrewing', ['home brewing', 'homebrew']),
  e('food', 'cocktails', ['coctails']),
  e('food', 'EatCheapAndHealthy', ['eat cheap and healthy', 'ecah']),
  e('food', 'MealPrepSunday', ['meal prep sunday', 'mealprep']),

  // Plants, outdoors and nature
  e('nature', 'houseplants', ['house plants', 'houseplant']),
  e('nature', 'succulents', ['sucullents', 'succulent']),
  e('nature', 'bonsai', ['bonzai']),
  e('nature', 'gardening', ['gardning']),
  e('nature', 'vegetablegardening', ['vegetable gardening']),
  e('nature', 'mycology', ['mycolgy']),
  e('nature', 'whatsthisplant', ['whats this plant', 'what is this plant']),
  e('nature', 'birding', ['birdwatching', 'bird watching']),
  e('nature', 'whatsthisbird', ['whats this bird', 'what is this bird']),
  e('outdoors', 'CampingandHiking', ['camping and hiking']),
  e('outdoors', 'Ultralight', ['ultra light']),
  e('outdoors', 'bicycletouring', ['bicycle touring', 'bike touring']),
  e('outdoors', 'bicycling', ['bicyling']),
  e('outdoors', 'climbing', ['climbin']),
  e('outdoors', 'Kayaking', ['kayacking']),
  e('outdoors', 'Fishing', ['fishin']),
  e('outdoors', 'NationalPark', ['national park', 'nationalparks']),
  e('science', 'geology', ['geolgy']),
  e('science', 'whatsthisrock', ['whats this rock', 'what is this rock']),
  e('science', 'astrophotography', ['astro photography']),
  e('science', 'space', ['spaceporn']),
  e('science', 'Astronomy', ['astronmy']),

  // Animals
  e('animals', 'aww', ['aw']),
  e('animals', 'Rabbits', ['rabbit']),
  e('animals', 'cats', ['catz']),
  e('animals', 'dogs', ['dogz']),
  e('animals', 'Dogtraining', ['dog training']),
  e('animals', 'Aquariums', ['aquarium']),
  e('animals', 'reptiles', ['reptile']),
  e('animals', 'snakes', ['snake']),
  e('animals', 'Beekeeping', ['bee keeping']),
  e('animals', 'BackYardChickens', ['backyard chickens']),
  e('animals', 'Horses', ['horse']),
  e('animals', 'parrots', ['parrot']),
  e('animals', 'Awwducational', ['aww educational']),

  // Making, fixing and collecting
  e('hobby', 'woodworking', ['wood working']),
  e('hobby', 'BeginnerWoodWorking', [
    'beginner woodworking',
    'beginner wood working',
  ]),
  e('hobby', 'knitting', ['kniting']),
  e('hobby', 'crochet', ['crotchet']),
  e('hobby', 'sewing', ['sowing']),
  e('hobby', 'Embroidery', ['embrodery']),
  e('hobby', 'Pottery', ['potery']),
  e('hobby', 'Leathercraft', ['leather craft']),
  e('hobby', 'Blacksmith', ['black smith']),
  e('hobby', 'DIY', ['do it yourself']),
  e('hobby', 'fixit', ['fix it']),
  e('hobby', 'HomeImprovement', ['home improvement']),
  e('hobby', 'functionalprint', ['functional print', 'functional prints']),
  e('hobby', 'MechanicalKeyboards', ['mechanical keyboards', 'mechkeys', 'mk']),
  e('collecting', 'Watches', ['watchs']),
  e('collecting', 'lego', ['legos']),
  e('collecting', 'Gunpla', ['gun pla']),
  e('hobby', 'minipainting', ['mini painting']),
  e('collecting', 'vinyl', ['vinly']),
  e('collecting', 'fountainpens', ['fountain pens', 'fountainpen']),
  e('hobby', 'lockpicking', ['lock picking']),
  e('collecting', 'Thrifting', ['thrifting finds']),

  // Curiosity, science and learning
  e('learning', 'whatisthisthing', ['what is this thing', 'witt']),
  e('humor', 'mildlyinteresting', ['mildly interesting']),
  e('learning', 'todayilearned', ['today i learned', 'til']),
  e('learning', 'AskHistorians', ['ask historians']),
  e('science', 'askscience', ['ask science']),
  e('learning', 'explainlikeimfive', ['explain like im five', 'eli5']),
  e('science', 'dataisbeautiful', ['data is beautiful']),
  e('learning', 'geography', ['geograpy']),
  e('learning', 'etymology', ['etymolgy']),
  e('learning', 'linguistics', ['linguistic']),
  e('gaming', 'chess', ['chesss']),
  e('gaming', 'puzzles', ['puzzle']),
  e('science', 'Physics', ['physic']),
  e('science', 'chemistry', ['chemestry']),

  // Humor and everyday life
  e('humor', 'mildlyinfuriating', ['mildly infuriating']),
  e('humor', 'CrappyDesign', ['crappy design']),
  e('humor', 'Wellthatsucks', ['well that sucks']),
  e('humor', 'oddlysatisfying', ['oddly satisfying']),
  e('humor', 'Showerthoughts', ['shower thoughts']),
  e('humor', 'BrandNewSentence', ['brand new sentence']),
  e('life', 'NoStupidQuestions', ['no stupid questions', 'nsq']),
  e('life', 'tipofmytongue', ['tip of my tongue', 'tomt']),
  e('life', 'LifeProTips', ['life pro tips', 'lpt']),
  e('life', 'Frugal', ['frugel']),
  e('life', 'BuyItForLife', ['buy it for life', 'bifl']),
  e('life', 'declutter', ['decluttering']),
  e('life', 'CasualConversation', ['casual conversation']),
  e('gaming', 'boardgames', ['board games']),
  e('gaming', 'DnD', ['dungeons and dragons', 'd and d']),
  e('fitness', 'running', ['runing']),
  e('fitness', 'bodyweightfitness', ['bodyweight fitness', 'bwf']),

  // Places and travel
  e('places', 'travel', ['travels']),
  e('places', 'solotravel', ['solo travel']),
  e('places', 'urbanplanning', ['urban planning']),
  e('places', 'urbanexploration', ['urban exploration', 'urbex']),
  e('places', 'trains', ['train']),
  e('places', 'transit', ['transits']),
  e('places', 'Lighthouses', ['lighthouse']),

  // Books and games
  e('books', 'books', ['book']),
  e('books', 'Fantasy', ['fantasy books']),
  e('books', 'printSF', ['print sf']),
  e('books', 'suggestmeabook', ['suggest me a book']),
  e('gaming', 'StardewValley', ['stardew valley', 'stardew']),
  e('gaming', 'retrogaming', ['retro gaming']),
  e('gaming', 'Minecraft', ['mine craft']),

  // Countries whose communities post mostly in English. News and politics
  // heavy, so the picker filters them harder. The demonym is an alias so a
  // title that says "Canadian" gives nothing away.
  country('canada', ['canadian', 'canadians']),
  country('australia', ['australian', 'australians', 'aussie', 'aussies']),
  country('unitedkingdom', ['united kingdom', 'uk', 'britain', 'british']),
  country('ireland', ['irish']),
  country('newzealand', ['new zealand', 'nz', 'kiwi', 'kiwis']),
  country('southafrica', ['south africa', 'south african', 'south africans']),
  country('india', ['indian', 'indians']),
  country('singapore', ['singaporean', 'singaporeans']),
  country('Philippines', ['philippine', 'filipino', 'filipina', 'filipinos']),
  country('Nigeria', ['nigerian', 'nigerians', 'naija']),
  country('Scotland', ['scottish', 'scots']),
  country('germany', ['german', 'germans', 'deutschland']),
  country('japan', ['japanese']),
  country('korea', ['korean', 'koreans', 'south korea']),
  country('thenetherlands', ['the netherlands', 'netherlands', 'dutch']),
  country('sweden', ['swedish', 'swede', 'swedes']),
  country('norway', ['norwegian', 'norwegians']),
  country('Denmark', ['danish', 'dane', 'danes']),
  country('mexico', ['mexican', 'mexicans']),
  country('Brazil', ['brazilian', 'brazilians', 'brasil']),
  country('Iceland', ['icelandic', 'icelander', 'icelanders']),
  country('italy', ['italian', 'italians', 'italia']),
];
