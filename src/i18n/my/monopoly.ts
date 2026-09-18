/**
 * The Burmese catalogue for Monopoly. Merged with the other catalogues in
 * `../index`; the shared shell keys live there. The forty space names stay in
 * English on both sides, because they are board data in `shared/monopoly.ts`
 * rather than messages — and a company called Apple is called Apple in every
 * language. The same treatment the caste names get.
 */
export const myMonopoly = {
  // --- landing (choose a game) --------------------------------------------
  'landing.monopoly.name': 'မိုနိုပိုလီ',
  'landing.monopoly.blurb':
    'နည်းပညာကုမ္ပဏီကြီးများကို ဝယ်ယူ၊ တိုးချဲ့ပြီး ကျန်သူများ ပြုတ်သည်အထိ အခွန်ကောက်ပါ။',
  'landing.monopoly.meta': 'ကစားသမား ၂–၈ ဦး · ပစ္စည်းရောင်းဝယ်မှု',

  // --- home ----------------------------------------------------------------
  'home.monopoly.tagline':
    'နည်းပညာကုမ္ပဏီ ၂၂ ခု၊ ဒေတာစင်တာ ၄ ခုနှင့် ဘဏ်တစ်ခု။ ကစားသမားတစ်ဦးတည်း ကျန်သည်အထိ ဝယ်၊ ဆောက်၊ ပေါင်နှံပြီး လဲလှယ်ပါ။',
  'home.monopoly.hostHint': 'နာရီမှလွဲ၍ ချိန်ညှိစရာ မရှိပါ — အခန်းဖန်တီးပြီး လှိမ့်လိုက်ရုံသာ။',

  // --- lobby ---------------------------------------------------------------
  'monopoly.lobby.how': 'ကစားနည်း',
  'monopoly.rule.roll':
    'သင့်အလှည့်တွင် အန်စာတုံးနှစ်လုံး လှိမ့်ပြီး ထွက်သည့်အရေအတွက်အတိုင်း လက်ယာရစ် ရွှေ့ပါ။ IPO ကို ဖြတ်လျှင် {salary} ရသည်။ အတူတူထွက်လျှင် ထပ်လှိမ့်ခွင့် ရသည်။',
  'monopoly.rule.buy':
    'ပိုင်ရှင်မရှိသေးသော ကုမ္ပဏီ၊ ဒေတာစင်တာ သို့မဟုတ် ဝန်ဆောင်မှုအကွက်ပေါ် ရပ်လျှင် ဘဏ်ထံမှ ဝယ်နိုင်သည်။ ငြင်းလျှင် — သို့မဟုတ် ဝယ်ရန်ငွေမလုံလောက်လျှင် — စားပွဲတစ်ခုလုံးပါဝင်သော လေလံသို့ ရောက်သွားသည်။ လေလံမှ တစ်ကြိမ်ထွက်ပြီးပါက ထိုအကွက်အတွက် ပြန်မဝင်နိုင်တော့ပါ။ လက်ထဲရှိငွေထက် ပို၍ ဈေးမပေးနိုင်ပါ။',
  'monopoly.rule.rent':
    'သူတစ်ပါးပိုင်အကွက်ပေါ် ရပ်လျှင် အခွန်ပေးရသည်။ ပိုင်ရှင်သည် ကဏ္ဍတစ်ခုလုံး ပိုင်ဆိုင်ပါက အဆောက်အအုံမရှိသေးသော ကုမ္ပဏီများ၏ အခွန် နှစ်ဆဖြစ်သည်။',
  'monopoly.rule.build':
    'ကဏ္ဍတစ်ခုလုံး ပိုင်မှသာ ချဲ့ထွင်နိုင်သည်။ ရုံးခန်းများကို ကဏ္ဍအတွင်း ညီညီတူတူ ဆောက်ရသည် — ကျန်ကုမ္ပဏီများ မမီမချင်း တစ်ခုတည်း ဆက်မဆောက်ရ — ပဉ္စမမြောက်ရုံးခန်းမှာ ဌာနချုပ် ဖြစ်သည်။',
  'monopoly.rule.jail':
    'အလှည့်တစ်ခုတွင် အတူတူသုံးကြိမ်ထွက်ခြင်း၊ Go to Antitrust အကွက် သို့မဟုတ် ကတ်တစ်ကတ်က သင့်ကို ယှဉ်ပြိုင်မှုစိစစ်ခြင်း ခံရစေနိုင်သည်။ ဒဏ်ငွေ {fine} ပေး၊ ကတ်တင်ပြ၊ သို့မဟုတ် အတူတူထွက်အောင် လှိမ့်၍ ပြီးဆုံးစေပါ။',
  'monopoly.rule.money':
    'ငွေမလောက်လျှင် ရုံးခန်းများကို တစ်ဝက်ဈေးဖြင့် ပြန်ရောင်း၊ ပိုင်ဆိုင်မှုကို ပေါင်နှံ၊ သို့မဟုတ် အခြားကစားသမားနှင့် လဲလှယ်ပါ။ ပေးဆပ်ရန် နည်းလမ်းကုန်လျှင် ပြုတ်သွားသည်။',
  'monopoly.rule.win': 'နောက်ဆုံးအထိ ငွေမပြုတ်ဘဲ ကျန်နေသူ အနိုင်ရသည်။',

  // --- turn --------------------------------------------------------------
  'monopoly.turn.yours': 'သင့်အလှည့်',
  'monopoly.turn.other': '{name} ကစားရန်',
  'monopoly.turn.moving': '{name} ရွှေ့နေသည်…',
  'monopoly.roll': 'အန်စာတုံး လှိမ့်မည်',
  'monopoly.rollAgain': 'အတူတူထွက် — ထပ်လှိမ့်ပါ',
  'monopoly.endTurn': 'အလှည့်ပြီးဆုံး',
  'monopoly.rolled': '{name} သည် {a} နှင့် {b} ထွက်သည်',

  // --- the panels a narrow screen keeps its side columns in ----------------
  'monopoly.tab.players': 'ကစားသမားများ',
  'monopoly.tab.property': 'ပစ္စည်းများ',
  'monopoly.tab.log': 'မှတ်တမ်း',
  'monopoly.panel.close': 'ပိတ်ရန်',
  'monopoly.panel.tap': 'အကွက်တစ်ခုကို နှိပ်၍ အသေးစိတ် ကြည့်ပါ',

  // --- buying and auctions -------------------------------------------------
  'monopoly.buy.title': '{name} ရောင်းရန်ရှိသည်',
  'monopoly.buy.action': '{price} ဖြင့် ဝယ်မည်',
  'monopoly.buy.pass': 'လေလံသို့ ပို့မည်',
  'monopoly.buy.other': '{name} သည် {space} ကို ဝယ်မည်မဝယ်မည် စဉ်းစားနေသည်။',
  'monopoly.auction.title': '{name} လေလံတင်နေသည်',
  'monopoly.auction.standing': 'လက်ရှိဈေး {amount} — {name} ထံမှ',
  'monopoly.auction.none': 'ဈေးမပေးရသေးပါ',
  'monopoly.auction.bid': 'ဈေးပေးမည်',
  'monopoly.auction.pass': 'ထွက်မည်',
  'monopoly.auction.waiting': 'နောက်ထပ် {count} ဦးကို စောင့်နေသည်',
  'monopoly.auction.cash': 'သင့်လက်ထဲတွင် {amount} ရှိသည်',
  'monopoly.auction.tooHigh': 'သင့်လက်ထဲရှိ ငွေထက် ပိုနေသည်',
  'monopoly.auction.broke': '{amount} ကို မတတ်နိုင်သဖြင့် ထွက်ရန်သာ ကျန်သည်။',
  'monopoly.auction.leading': 'သင့်ဈေးက လက်ရှိအမြင့်ဆုံး ဖြစ်နေသည်။ အခြားသူများကို စောင့်နေသည်။',
  'monopoly.auction.out': 'သင် ထွက်ပြီးဖြစ်၍ ဤအကွက်အတွက် ပြန်ဈေးမပေးနိုင်တော့ပါ။',

  // --- trading -------------------------------------------------------------
  'monopoly.trade.open': 'လဲလှယ်မှု ကမ်းလှမ်းမည်',
  'monopoly.trade.title': 'လဲလှယ်မှု ကမ်းလှမ်းမည်',
  'monopoly.trade.with': 'နှင့်',
  'monopoly.trade.youGive': 'သင် ပေးမည်',
  'monopoly.trade.youWant': 'သင် လိုချင်သည်',
  'monopoly.trade.cash': 'ငွေသား',
  'monopoly.trade.send': 'ကမ်းလှမ်းချက် ပို့မည်',
  'monopoly.trade.cancel': 'ပယ်ဖျက်မည်',
  'monopoly.trade.incoming': '{name} က သင့်ကို လဲလှယ်မှု ကမ်းလှမ်းသည်',
  'monopoly.trade.theyGive': 'သူတို့ ပေးမည်',
  'monopoly.trade.theyWant': 'သူတို့ လိုချင်သည်',
  'monopoly.trade.accept': 'လက်ခံမည်',
  'monopoly.trade.decline': 'ငြင်းမည်',
  'monopoly.trade.waiting': '{name} ၏ အဖြေကို စောင့်နေသည်။',
  'monopoly.trade.elsewhere': '{a} နှင့် {b} တို့ ညှိနှိုင်းနေသည်။',
  'monopoly.trade.nothing': 'ဘာမျှမပါ',

  // --- gaol ----------------------------------------------------------------
  'monopoly.jail.title': 'သင် ယှဉ်ပြိုင်မှုစိစစ်ခြင်း ခံနေရသည်',
  'monopoly.jail.pay': '{fine} ပေးမည်',
  'monopoly.jail.card': 'ကတ် တင်ပြမည်',
  'monopoly.jail.roll': 'အတူတူထွက်အောင် လှိမ့်မည်',
  'monopoly.jail.other': '{name} ယှဉ်ပြိုင်မှုစိစစ်ခြင်း ခံနေရသည်။',
  'monopoly.jail.visiting': 'စွဲချက်မတင်ရသေး',

  // --- money trouble -------------------------------------------------------
  'monopoly.debt.title': 'သင် {amount} ပေးရန်ရှိသည်',
  'monopoly.debt.hint': 'ရုံးခန်းများရောင်း၍ဖြစ်စေ ပိုင်ဆိုင်မှုပေါင်နှံ၍ဖြစ်စေ ဖြည့်ပါ။',
  'monopoly.debt.giveUp': 'ပြုတ်ကြောင်း ကြေညာမည်',
  'monopoly.debt.other': '{name} သည် {amount} ပေးရန်ရှိပြီး ငွေရှာနေသည်။',

  // --- property management -------------------------------------------------
  'monopoly.manage.title': 'သင့်ပိုင်ဆိုင်မှု',
  'monopoly.manage.none': 'ပိုင်ဆိုင်မှု မရှိသေးပါ။',
  'monopoly.manage.build': 'ချဲ့ထွင်မည်',
  'monopoly.manage.sell': 'ရုံးခန်းတစ်ခု ရောင်းမည်',
  'monopoly.manage.mortgage': 'ပေါင်နှံမည်',
  'monopoly.manage.unmortgage': 'ပေါင်ရွေးမည်',
  'monopoly.manage.mortgaged': 'ပေါင်နှံထားသည်',
  'monopoly.manage.others': 'ကျန်ကစားသမားများ',
  'monopoly.manage.noneYet': 'ဘာမျှ မပိုင်သေးပါ။',
  'monopoly.manage.rent': 'အခွန် {amount}',
  'monopoly.manage.rentTimes': 'အခွန် အန်စာတုံးပေါင်း၏ {n} ဆ',
  'monopoly.manage.set': 'စုစုပေါင်း {total} ခုတွင် {owned} ခု',
  'monopoly.manage.buildHint': 'ဤနေရာတွင် ရုံးခန်းတစ်ခု {amount} ဖြင့် ထပ်ဆောက်ပါ။ အခွန် သိသိသာသာ တက်သွားသည်။',
  'monopoly.manage.sellHint': 'ရုံးခန်းတစ်ခုကို ဘဏ်သို့ {amount} ဖြင့် ပြန်ရောင်းပါ။ အခွန် ပြန်ကျသည်။',
  'monopoly.manage.mortgageHint':
    'ဤပစ္စည်းကို အာမခံထား၍ {amount} ချေးယူပါ။ {cost} ဖြင့် ပြန်မရွေးမချင်း အခွန်မရဘဲ၊ ပေါင်နှံထားစဉ် ၎င်း၏ကဏ္ဍကို မချဲ့ထွင်နိုင်ပါ။',
  'monopoly.manage.unmortgageHint': '{amount} ဖြင့် အကြွေးပြန်ဆပ်ပါ။ အခွန် ပြန်စတင်ရရှိမည်။',
  'monopoly.bank.stock': 'ဘဏ်: ရုံးခန်း {houses} ခု၊ ဌာနချုပ် {hotels} ခု',
  'monopoly.salary': 'IPO: {amount}',

  // --- sectors (the colour bands) -------------------------------------------
  'monopoly.sector.brown': 'လူမှုကွန်ရက်',
  'monopoly.sector.cyan': 'စားသုံးသူ အက်ပ်များ',
  'monopoly.sector.pink': 'ဖန်တီးမှုနှင့် လုပ်ငန်းသုံး',
  'monopoly.sector.orange': 'မီဒီယာနှင့် ကိရိယာ',
  'monopoly.sector.red': 'စက်ကွင်းအီလက်ထရွန်နစ်',
  'monopoly.sector.yellow': 'လျှပ်စစ်ကားနှင့် AI',
  'monopoly.sector.green': 'ကလောက် ကုမ္ပဏီကြီးများ',
  'monopoly.sector.blue': 'အကြီးဆုံး နှစ်ခု',

  // --- the hover card -------------------------------------------------------
  'monopoly.detail.rentBare': 'အခွန်',
  'monopoly.detail.rentSet': 'ကဏ္ဍတစ်ခုလုံး ပိုင်ဆိုင်မှု',
  'monopoly.detail.rentOffice': 'ရုံးခန်း ၁ ခု',
  'monopoly.detail.rentOffices': 'ရုံးခန်း {n} ခု',
  'monopoly.detail.rentHQ': 'ဌာနချုပ်',
  'monopoly.detail.stations': 'ဒေတာစင်တာ ၄ ခုတွင် {n} ခု',
  'monopoly.detail.utilityOne': 'ဝန်ဆောင်မှု တစ်ခု',
  'monopoly.detail.utilityBoth': 'ဝန်ဆောင်မှု နှစ်ခုလုံး',
  'monopoly.detail.times': 'အန်စာတုံးပေါင်း၏ {n} ဆ',
  'monopoly.detail.officeCost': 'ရုံးခန်းတစ်ခုလျှင် {amount}',
  'monopoly.detail.mortgageValue': 'ပေါင်နှံလျှင် {amount} ရမည်',
  'monopoly.detail.youOwn': 'သင့်ပိုင်',
  'monopoly.detail.go': 'ဤနေရာကို ဖြတ်တိုင်း သို့မဟုတ် ရောက်တိုင်း {amount} ရမည်။',
  'monopoly.detail.jail': 'ဖြတ်သန်းရုံဖြင့် ဘာမှမကုန်ပါ။ ပို့ခံရမှသာ ထိန်းသိမ်းခံရသည်။',
  'monopoly.detail.parking': 'ဤနေရာတွင် ဘာမှမဖြစ်ပါ။ တစ်လှည့် နားပါ။',
  'monopoly.detail.goToJail': 'Antitrust သို့ တန်းသွားရမည်။ လမ်းတွင် IPO ငွေ မရပါ။',
  'monopoly.detail.chance': 'Market ကတ်တစ်ကတ် လှန်ပြီး ပါသည့်အတိုင်း လုပ်ပါ။',
  'monopoly.detail.chest': 'Venture Fund ကတ်တစ်ကတ် လှန်ပြီး ပါသည့်အတိုင်း လုပ်ပါ။',
  'monopoly.detail.tax': 'ဘဏ်သို့ {amount} ပေးရမည်။',

  // --- the board -----------------------------------------------------------
  'monopoly.space.price': 'ဈေး {price}',
  'monopoly.space.rent': 'အခွန် {rent}',
  'monopoly.space.owner': '{name} ပိုင်',
  'monopoly.space.bank': 'ပိုင်ရှင်မရှိ',
  'monopoly.space.houses': 'ရုံးခန်း {n} ခု',
  'monopoly.space.house': 'ရုံးခန်း ၁ ခု',
  'monopoly.space.hotel': 'ဌာနချုပ်',
  'monopoly.card.chance': 'ဈေးကွက်',
  'monopoly.card.chest': 'ရင်းနှီးမြှုပ်နှံမှုရန်ပုံငွေ',

  // --- panels and the end --------------------------------------------------
  'monopoly.worth': 'တန်ဖိုး {amount}',
  'monopoly.bankrupt': 'ပြုတ်ပြီ',
  'monopoly.you': 'သင်',
  'monopoly.logMark': 'အလှည့် {n}',
  'monopoly.winner': '{name} အနိုင်ရသည်!',
  'monopoly.result.reason': 'နောက်ဆုံးအထိ ငွေမပြုတ်ဘဲ ကျန်နေသူ။',
  'monopoly.turnClock.hint':
    '— အချိန်ကုန်လျှင် ရပ်ထားသည့်ကွက်ကိုဝယ်ယူ၊ လေလံရုပ်သိမ်း၊ ကမ်းလှမ်းချက်ငြင်း၊ ယှဉ်ပြိုင်မှုစိစစ်ခြင်းမှလွတ်ရန် လှိမ့်၊ သို့မဟုတ် မြေပေါင်ပြီး အကြွေးဆပ်သည်',

  'monopoly.bidClock': 'လေလံစျေးဖြေရန်အချိန်',
  'monopoly.bidClock.same': 'အလှည့်အချိန်အတိုင်း',
  'monopoly.bidClock.hint':
    '— လေလံတစ်ကြိမ်တိုင်း ပြန်စတင်ရေတွက်သည်။ အချိန်ကုန်သူသည် လေလံမှ အလိုအလျောက် ထွက်သွားသည်',

  // --- table talk ----------------------------------------------------------
  'chat.title': 'စကားပြော',
  'chat.label': 'ဝိုင်းသို့ စာပို့ရန်',
  'chat.placeholder': 'တစ်ခုခုပြောပါ…',
  'chat.send': 'ပို့မည်',
  'chat.empty': 'ဘာမှမပြောရသေးပါ။ ဝိုင်းက နားထောင်နေသည်။',
  'chat.remaining': '{n} လုံးကျန်',
  'chat.newCount': 'အသစ် {count} ခု ↓',
  'chat.toNewest': 'နောက်ဆုံးသို့ ↓',
  'chat.joined': '{name} ဝိုင်းထဲဝင်လာသည်။',
  'chat.left': '{name} ဝိုင်းမှထွက်သွားသည်။',
  'chat.away': '{name} ချိတ်ဆက်မှုပြတ်သွားသည်။',
  'chat.back': '{name} ပြန်ရောက်လာပြီ။',
}
