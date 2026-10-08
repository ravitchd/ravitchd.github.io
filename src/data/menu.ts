// Everything on Dylan's menu, grouped the way MENU.txt groups it.
// A dish with `recipe` links to that file in src/content/recipes; the rest show
// as "on the way" until a recipe is written. When you add a recipe for one of
// these, set its `recipe` to the new file's name (without .md).

export type MenuItem = { name: string; recipe?: string };
export type MenuGroup = { title?: string; items: MenuItem[] };

const names = (...list: string[]): MenuItem[] => list.map((name) => ({ name }));

export const MENU: Record<'savory' | 'sweet' | 'bread' | 'technique', MenuGroup[]> = {
  savory: [
    {
      items: [
        ...names(
          'Enchiladas',
          'Mexican Rice',
          'Roasted Potatoes',
          'Mac and Cheese',
          'Spaghetti',
          'Chicken and Rice',
          'Omelette',
          'Bratwursts',
          'Chicken Spinach Wrap',
          'Lasagna Noodle Soup',
          'Loaded Potato Soup',
          'Creamy Chicken Bowtie',
          'Cacio e Pepe',
          'Pesto Pasta',
          'Salmon Orzo',
          'Chili',
          'Egg Bites',
          'Chicken Stew',
          'Potato Soup',
          'Tomato Basil Soup',
          'Garlic Soy Wings',
          'Shrimp Spring Rolls',
          'Spanish Rice',
          'Chicken Taquitos',
          'Gyozas',
          'Crunchy Hot Chicken',
        ),
        { name: 'Salmon Bowls', recipe: 'salmon-bowl-marinade' },
        { name: 'Tini Mac and Cheese', recipe: 'tini-mac-and-cheese' },
      ],
    },
  ],
  sweet: [
    {
      title: 'Cookies',
      items: [
        ...names(
          'Bakery Chocolate Chip Cookies',
          'Chocolate Chip Pistachio Cookies',
          'Matcha Crinkle Cookies',
        ),
        { name: 'Chai Spice Cookies', recipe: 'chai-spice-cookies' },
        { name: 'Chai Spice Mix', recipe: 'chai-spice-cookies' },
        ...names(
          'Dark Chocolate Candy Cane Cookies',
          'Espresso Chocolate Chip Cookies',
          'Raspberry Lemon Cookies',
          'Sugar Cookies',
          'Sugar Cookie Icing',
          'Royal Icing',
        ),
      ],
    },
    {
      title: 'Muffins and loaves',
      items: names(
        'Blueberry Muffins',
        'Almond Croissants',
        'Chocolate Zucchini Bread',
        'Lemon Zucchini Bread',
        'Zucchini Bread',
      ),
    },
    {
      title: 'Cakes and frosting',
      items: names(
        'Carrot Cake',
        'Strawberry Cream Cake',
        'Pistachio Cake',
        'Marble Cake',
        'Pistachio Cream',
        'Vanilla Buttercream',
        'Chocolate Buttercream',
        'Pistachio Buttercream',
      ),
    },
    {
      title: 'Snacks and protein',
      items: names(
        'Apple Pie Baked Oatmeal',
        'Peanut Butter Protein Cookies',
        'Edible Cookie Dough',
        'Cookies and Cream Protein Shake',
        'Banana Chocolate Chip Oatmeal Muffins',
      ),
    },
  ],
  bread: [],
  technique: [],
};

export const CATEGORIES = [
  { id: 'savory', label: 'Savory' },
  { id: 'sweet', label: 'Sweet' },
  { id: 'bread', label: 'Bread' },
  { id: 'technique', label: 'Techniques' },
] as const;
