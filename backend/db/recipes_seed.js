const db = require('./init')

function seedRecipes() {
  // Clear and reseed
  const count = db.prepare('SELECT COUNT(*) as cnt FROM recipes').get()
  if (count.cnt > 6) return // already seeded with real data

  db.prepare('DELETE FROM recipes').run()

  const insert = db.prepare(`
    INSERT INTO recipes (name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const recipes = [
    [
      'Греческий салат',
      180, 6, 12, 10, 10, '🥗',
      '["Лёгкий","Без готовки","ПП"]',
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&q=80',
      JSON.stringify([
        { name: 'Помидоры черри', amount: '200г' },
        { name: 'Огурец', amount: '1 шт' },
        { name: 'Сыр Фета', amount: '100г' },
        { name: 'Оливки', amount: '50г' },
        { name: 'Красный лук', amount: '½ шт' },
        { name: 'Оливковое масло', amount: '2 ст.л.' },
        { name: 'Орегано', amount: '1 ч.л.' },
        { name: 'Соль, перец', amount: 'по вкусу' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Помидоры черри разрежь пополам, огурец нарежь крупными кубиками.' },
        { step: 2, text: 'Красный лук нарежь тонкими полукольцами.' },
        { step: 3, text: 'Выложи овощи в миску, добавь оливки.' },
        { step: 4, text: 'Сверху покроши фету крупными кусками.' },
        { step: 5, text: 'Полей оливковым маслом, посыпь орегано, солью и перцем.' },
        { step: 6, text: 'Аккуратно перемешай и сразу подавай.' }
      ]),
      2
    ],
    [
      'Куриная грудка с брокколи',
      320, 42, 8, 12, 25, '🍗',
      '["Белок","ПП","Фитнес"]',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      JSON.stringify([
        { name: 'Куриная грудка', amount: '300г' },
        { name: 'Брокколи', amount: '200г' },
        { name: 'Чеснок', amount: '2 зубчика' },
        { name: 'Оливковое масло', amount: '1 ст.л.' },
        { name: 'Лимонный сок', amount: '1 ст.л.' },
        { name: 'Соль, перец, паприка', amount: 'по вкусу' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Куриную грудку нарежь на медальоны толщиной 1-1.5 см, отбей немного.' },
        { step: 2, text: 'Посоли, поперчи, посыпь паприкой с обеих сторон.' },
        { step: 3, text: 'Разогрей сковороду с маслом на среднем огне, обжарь курицу 4-5 минут с каждой стороны.' },
        { step: 4, text: 'Брокколи раздели на соцветия, отвари в подсоленной воде 5 минут или приготовь на пару.' },
        { step: 5, text: 'Чеснок измельчи и добавь к брокколи с лимонным соком.' },
        { step: 6, text: 'Подавай курицу с брокколи, можно добавить немного соевого соуса.' }
      ]),
      2
    ],
    [
      'Смузи-боул с ягодами',
      280, 8, 6, 48, 10, '🫐',
      '["Завтрак","Вегетарианский","Быстро"]',
      'https://images.unsplash.com/photo-1490323914169-4b97c1f4c2ab?w=400&q=80',
      JSON.stringify([
        { name: 'Замороженная черника', amount: '150г' },
        { name: 'Замороженная малина', amount: '100г' },
        { name: 'Банан', amount: '1 шт' },
        { name: 'Греческий йогурт', amount: '100г' },
        { name: 'Мёд', amount: '1 ч.л.' },
        { name: 'Гранола', amount: '30г' },
        { name: 'Свежие ягоды для украшения', amount: 'горсть' },
        { name: 'Семена чиа', amount: '1 ч.л.' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Замороженные ягоды и банан положи в блендер.' },
        { step: 2, text: 'Добавь йогурт и мёд.' },
        { step: 3, text: 'Взбей до густой однородной массы. Смузи должен быть очень густым — как мороженое.' },
        { step: 4, text: 'Вылей в глубокую миску.' },
        { step: 5, text: 'Украси гранолой, свежими ягодами и семенами чиа.' },
        { step: 6, text: 'Подавай сразу, пока не растаяло!' }
      ]),
      1
    ],
    [
      'Паста с лососем в сливочном соусе',
      520, 28, 22, 48, 20, '🍝',
      '["Ужин","Рыба","Быстро"]',
      'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&q=80',
      JSON.stringify([
        { name: 'Паста фетучини', amount: '150г' },
        { name: 'Лосось', amount: '200г' },
        { name: 'Сливки 20%', amount: '150мл' },
        { name: 'Чеснок', amount: '2 зубчика' },
        { name: 'Пармезан', amount: '30г' },
        { name: 'Шпинат', amount: '50г' },
        { name: 'Лимон', amount: '½ шт' },
        { name: 'Укроп', amount: 'пучок' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Отвари пасту по инструкции до состояния al dente, сохрани ½ стакана воды от варки.' },
        { step: 2, text: 'Лосось нарежь кубиками 2-3 см, посоли и поперчи.' },
        { step: 3, text: 'Обжарь лосось на сковороде 2-3 минуты, не пересуши — он должен остаться нежным.' },
        { step: 4, text: 'В той же сковороде обжарь чеснок 30 секунд, влей сливки.' },
        { step: 5, text: 'Добавь шпинат, туши 2 минуты. Если соус густой, добавь воду от пасты.' },
        { step: 6, text: 'Соедини пасту с соусом, добавь лосось, сок лимона и укроп.' },
        { step: 7, text: 'Подавай сразу, посыпав тёртым пармезаном.' }
      ]),
      2
    ],
    [
      'Омлет с авокадо и томатами',
      310, 18, 22, 8, 10, '🍳',
      '["Завтрак","Быстро","Белок"]',
      'https://images.unsplash.com/photo-1510693206972-df098062cb71?w=400&q=80',
      JSON.stringify([
        { name: 'Яйца', amount: '3 шт' },
        { name: 'Авокадо', amount: '½ шт' },
        { name: 'Помидоры черри', amount: '5-6 шт' },
        { name: 'Сыр моцарелла', amount: '40г' },
        { name: 'Молоко', amount: '2 ст.л.' },
        { name: 'Масло сливочное', amount: '1 ч.л.' },
        { name: 'Базилик', amount: 'несколько листиков' },
        { name: 'Соль, перец', amount: 'по вкусу' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Яйца взбей с молоком, солью и перцем до однородности.' },
        { step: 2, text: 'Авокадо нарежь ломтиками, черри разрежь пополам.' },
        { step: 3, text: 'Разогрей сковороду с маслом на среднем огне.' },
        { step: 4, text: 'Вылей яичную смесь, когда края начнут схватываться — уложи начинку на одну половину.' },
        { step: 5, text: 'Посыпь моцареллой, сложи омлет пополам и накрой крышкой на 1 минуту.' },
        { step: 6, text: 'Подавай сразу с листиками базилика.' }
      ]),
      1
    ],
    [
      'Боул с киноа и нутом',
      420, 18, 14, 58, 20, '🥙',
      '["Обед","Вегетарианский","ПП","Фитнес"]',
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
      JSON.stringify([
        { name: 'Киноа', amount: '80г сухой' },
        { name: 'Нут консервированный', amount: '150г' },
        { name: 'Огурец', amount: '1 шт' },
        { name: 'Помидоры черри', amount: '10 шт' },
        { name: 'Руккола', amount: '40г' },
        { name: 'Тахини', amount: '2 ст.л.' },
        { name: 'Лимонный сок', amount: '2 ст.л.' },
        { name: 'Чеснок', amount: '1 зубчик' },
        { name: 'Паприка, соль', amount: 'по вкусу' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Киноа промой и отвари в подсоленной воде 15 минут (1:2), дай постоять 5 минут под крышкой.' },
        { step: 2, text: 'Нут слей, промой и обсуши. Обжарь на сухой сковороде с паприкой и солью 5 минут до хрустящей корочки.' },
        { step: 3, text: 'Приготовь заправку: смешай тахини, лимонный сок, чеснок и 2-3 ст.л. воды до кремовой консистенции.' },
        { step: 4, text: 'Огурец нарежь кубиками, черри разрежь пополам.' },
        { step: 5, text: 'В боул выложи киноа, сверху — рукколу, овощи и нут.' },
        { step: 6, text: 'Полей заправкой тахини и сразу подавай.' }
      ]),
      2
    ],
    [
      'Творожные сырники',
      230, 14, 8, 26, 20, '🧁',
      '["Завтрак","Десерт","Быстро"]',
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&q=80',
      JSON.stringify([
        { name: 'Творог 5%', amount: '300г' },
        { name: 'Яйцо', amount: '1 шт' },
        { name: 'Мука', amount: '3 ст.л.' },
        { name: 'Сахар', amount: '2 ст.л.' },
        { name: 'Ванилин', amount: 'щепотка' },
        { name: 'Соль', amount: 'щепотка' },
        { name: 'Масло для жарки', amount: '1 ст.л.' },
        { name: 'Сметана или варенье', amount: 'для подачи' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Творог хорошо разомни вилкой или протри через сито для однородности.' },
        { step: 2, text: 'Добавь яйцо, сахар, ванилин и соль, перемешай.' },
        { step: 3, text: 'Всыпь муку и замеси мягкое тесто. Оно должно держать форму но не быть тугим.' },
        { step: 4, text: 'Руки обваляй в муке, слепи сырники толщиной 1.5 см.' },
        { step: 5, text: 'Обжарь на среднем огне 3-4 минуты с каждой стороны до золотистой корочки.' },
        { step: 6, text: 'Подавай горячими со сметаной или вареньем.' }
      ]),
      4
    ],
    [
      'Куриный суп с лапшой',
      180, 18, 4, 16, 40, '🍲',
      '["Обед","Сытный","ПП"]',
      'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80',
      JSON.stringify([
        { name: 'Куриная грудка', amount: '300г' },
        { name: 'Морковь', amount: '1 шт' },
        { name: 'Картофель', amount: '2 шт' },
        { name: 'Лук репчатый', amount: '1 шт' },
        { name: 'Лапша яичная', amount: '80г' },
        { name: 'Чеснок', amount: '2 зубчика' },
        { name: 'Лавровый лист', amount: '2 шт' },
        { name: 'Укроп, петрушка', amount: 'пучок' },
        { name: 'Соль, перец горошком', amount: 'по вкусу' }
      ]),
      JSON.stringify([
        { step: 1, text: 'Куриную грудку залей 1.5 л холодной воды, доведи до кипения, сними пену.' },
        { step: 2, text: 'Добавь целую луковицу, лавровый лист и перец горошком. Вари на малом огне 25 минут.' },
        { step: 3, text: 'Вынь курицу, бульон процеди. Лук выброси.' },
        { step: 4, text: 'Морковь нарежь кружочками, картофель кубиками, добавь в бульон. Вари 10 минут.' },
        { step: 5, text: 'Курицу разбери на волокна, верни в суп.' },
        { step: 6, text: 'Добавь лапшу, вари ещё 5 минут. В конце — чеснок и зелень.' },
        { step: 7, text: 'Посоли по вкусу и подавай горячим.' }
      ]),
      4
    ]
  ]

  // Add columns if they don't exist
  try {
    db.exec(`ALTER TABLE recipes ADD COLUMN protein REAL DEFAULT 0`)
    db.exec(`ALTER TABLE recipes ADD COLUMN fat REAL DEFAULT 0`)
    db.exec(`ALTER TABLE recipes ADD COLUMN carbs REAL DEFAULT 0`)
    db.exec(`ALTER TABLE recipes ADD COLUMN image_url TEXT`)
    db.exec(`ALTER TABLE recipes ADD COLUMN ingredients TEXT DEFAULT '[]'`)
    db.exec(`ALTER TABLE recipes ADD COLUMN steps TEXT DEFAULT '[]'`)
    db.exec(`ALTER TABLE recipes ADD COLUMN servings INTEGER DEFAULT 2`)
  } catch (e) {
    // columns already exist
  }

  const insertFull = db.prepare(`
    INSERT INTO recipes (name, calories, protein, fat, carbs, time, emoji, tags, image_url, ingredients, steps, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((items) => {
    for (const item of items) insertFull.run(...item)
  })

  insertMany(recipes)
  console.log(`✅ Seeded ${recipes.length} recipes`)
}

module.exports = { seedRecipes }
