/**
 * The Burmese catalogue for Coup. Merged with the other catalogues in `../index`;
 * the shared shell keys live there. Character names are transliterated rather
 * than translated, so the word on the card matches what players say aloud.
 */
export const myCoup = {
  // --- landing (choose a game) ----------------------------------------------
  'landing.coup.name': 'ကူး (Coup)',
  'landing.coup.blurb': 'သင်လိုချင်သည့် ဇာတ်ကောင်ကို ပိုင်ဆိုင်ကြောင်း ပြောပါ — ဖော်ထုတ်ခံရမည်ကိုတော့ သတိထားပါ။',
  'landing.coup.meta': 'ကစားသမား ၂–၆ ဦး · လှည့်စားမှု',

  // --- home ------------------------------------------------------------------
  'home.coup.tagline':
    'လှည့်စားမှုနှင့် ခန့်မှန်းမှု ဂိမ်း။ လှျို့ဝှက်ကတ်နှစ်ခု၊ ဇာတ်ကောင်ငါးမျိုး၊ ဘယ်ဟာကိုင်ထားသည်ကို အမှန်ပြောရန် တာဝန်လုံးဝမရှိပါ။',
  'home.coup.hostHint':
    'ပထမဆုံးစမည့်နေရာအတွက် အန်စာလှိမ့်မလား၊ အလှည့်တစ်ခုလျှင် အချိန်မည်မျှပေးမလဲ ရွေးပါ။ နှစ်ခုစလုံးကို အခန်းစောင့်ဆိုင်းခန်းတွင် ပြန်ပြောင်းနိုင်သည်။',

  // --- lobby -----------------------------------------------------------------
  'coup.lobby.how': 'ကစားနည်း',
  'coup.lobby.characters': 'ဇာတ်ကောင် ငါးမျိုး',
  'coup.rule.influence': 'လှျို့ဝှက် ဩဇာကတ်နှစ်ခုနှင့် ဒင်္ဂါးနှစ်ခုဖြင့် စတင်သည်။ ကတ်နှစ်ခုလုံး ဆုံးရှုံးလျှင် ထွက်ရမည်။',
  'coup.rule.turn': 'သင့်အလှည့်တွင် လုပ်ဆောင်ချက် တစ်ခုတည်းသာ ရွေးပါ။ အချို့မှာ ဇာတ်ကောင်တစ်ခုကို ပိုင်ဆိုင်ကြောင်း ဆိုသည် — မည်သူမဆို ၎င်းကို လိမ်သည်ဟု စိန်ခေါ်နိုင်သည်။',
  'coup.rule.challenge': 'မှားယွင်းစွာ စိန်ခေါ်လျှင် ဩဇာတစ်ခု ဆုံးရှုံးမည်။ လိမ်နေသည်ကို ဖမ်းမိလျှင် လိမ်သူက ဆုံးရှုံးမည်။',
  'coup.rule.block': 'အချို့လုပ်ဆောင်ချက်များကို သင့်တော်သည့် ဇာတ်ကောင်ဖြင့် ပိတ်ဆို့နိုင်သည် — ပိတ်ဆို့မှုကိုလည်း စိန်ခေါ်နိုင်သည်။',
  'coup.rule.coup': 'ဒင်္ဂါး ခုနစ်ခုပေးပြီး ကူးလုပ်ပါ — ပိတ်ဆို့၍မရ၊ စိန်ခေါ်၍မရ။ ဒင်္ဂါး ဆယ်ခုရှိလျှင် မလုပ်မဖြစ် လုပ်ရမည်။',
  'coup.rule.win': 'ဩဇာကျန်သည့် နောက်ဆုံးကစားသမား အနိုင်ရသည်။',

  // --- characters ------------------------------------------------------------
  'coup.character.duke': 'ဒယုက် (Duke)',
  'coup.character.assassin': 'လူသတ်သမား (Assassin)',
  'coup.character.captain': 'ကပ္ပတိန် (Captain)',
  'coup.character.ambassador': 'သံအမတ် (Ambassador)',
  'coup.character.contessa': 'ကွန်တက်ဆာ (Contessa)',
  'coup.character.duke.power': 'အခွန်: ဒင်္ဂါး ၃ ခု ယူပါ။ နိုင်ငံခြားအကူအညီကို ပိတ်ဆို့သည်။',
  'coup.character.assassin.power': 'လုပ်ကြံ: ဒင်္ဂါး ၃ ခုပေးပြီး ကစားသမားတစ်ဦးအား ဩဇာတစ်ခု စွန့်စေသည်။',
  'coup.character.captain.power': 'ခိုးယူ: ကစားသမားတစ်ဦးထံမှ ဒင်္ဂါး ၂ ခု ယူသည်။ ခိုးယူမှုကို ပိတ်ဆို့သည်။',
  'coup.character.ambassador.power': 'လဲလှယ်: ကတ်ထုပ်မှ ၂ ခုယူပြီး ၂ ခုပြန်ပေးသည်။ ခိုးယူမှုကို ပိတ်ဆို့သည်။',
  'coup.character.contessa.power': 'လုပ်ကြံမှုကို ပိတ်ဆို့သည်။',

  // --- actions ---------------------------------------------------------------
  'coup.action.income': 'ဝင်ငွေ',
  'coup.action.foreignAid': 'နိုင်ငံခြားအကူအညီ',
  'coup.action.coup': 'ကူး',
  'coup.action.tax': 'အခွန်',
  'coup.action.assassinate': 'လုပ်ကြံ',
  'coup.action.steal': 'ခိုးယူ',
  'coup.action.exchange': 'လဲလှယ်',
  'coup.action.income.hint': 'ဒင်္ဂါး ၁ ခု ယူပါ။ မည်သူမျှ မတားနိုင်ပါ။',
  'coup.action.foreignAid.hint': 'ဒင်္ဂါး ၂ ခု ယူပါ။ ဒယုက်က ပိတ်ဆို့နိုင်သည်။',
  'coup.action.coup.hint': 'ဒင်္ဂါး ၇ ခုပေးပါ။ ပစ်မှတ်သည် ဩဇာတစ်ခု ဆုံးရှုံးမည် — မေးခွန်းမရှိ။',
  'coup.action.tax.hint': 'ဒယုက်ဟု ဆိုကာ ဒင်္ဂါး ၃ ခု ယူပါ။',
  'coup.action.assassinate.hint': 'လူသတ်သမားဟု ဆိုကာ ဒင်္ဂါး ၃ ခုပေးပြီး တိုက်ခိုက်ပါ။',
  'coup.action.steal.hint': 'ကပ္ပတိန်ဟု ဆိုကာ ကစားသမားတစ်ဦးထံမှ ဒင်္ဂါး ၂ ခု ယူပါ။',
  'coup.action.exchange.hint': 'သံအမတ်ဟု ဆိုကာ ကတ်ထုပ်နှင့် လဲလှယ်ပါ။',

  // --- table -----------------------------------------------------------------
  'coup.yourTurn': 'သင့်အလှည့် — လုပ်ဆောင်ချက် ရွေးပါ',
  'coup.playerTurn': '{name} လုပ်ဆောင်ရန်',
  'coup.coins': 'ဒင်္ဂါး {n} ခု',
  'coup.coins.one': 'ဒင်္ဂါး ၁ ခု',
  'coup.influence': 'ဩဇာ {n} ခု',
  'coup.out': 'ထွက်',
  'coup.deck': 'ကတ်ထုပ်တွင် {n} ခု',
  'coup.hand.title': 'သင့်ဩဇာ',
  'coup.hand.hidden': 'သင်သာ မြင်နိုင်သည်။',
  'coup.log.title': 'မှတ်တမ်း',
  'coup.controls.title': 'သင့်လှည့်',
  'coup.controls.hide': 'ခလုတ်များကို ခေါက်သိမ်းရန်',
  'coup.controls.show': 'ခလုတ်များကို ပြန်ဖွင့်ရန်',


  'coup.court.title': 'ဆုံးရှုံးထားသော ဩဇာ',
  'coup.court.empty': 'မည်သူမျှ ဩဇာ မဆုံးရှုံးသေးပါ။',
  'coup.court.owner': '{name} ၏',
  'coup.pickTarget': '{action} အတွက် ပစ်မှတ် ရွေးပါ',
  'coup.cancel': 'ပယ်ဖျက်',

  // --- the pending window ----------------------------------------------------
  'coup.pending.action': '{name} က {action} ကြေညာသည်',
  'coup.pending.actionOn': '{name} က {target} အပေါ် {action} ကြေညာသည်',
  'coup.pending.waiting': 'ကစားသမား {n} ဦးကို စောင့်နေသည်',
  'coup.pending.block': '{name} က {character} ဖြင့် ပိတ်ဆို့သည်',
  'coup.pending.lose': '{name} သည် ဩဇာတစ်ခု စွန့်နေသည်',
  'coup.pending.exchange': '{name} သည် ကတ်ထုပ်နှင့် လဲလှယ်နေသည်',
  'coup.challenge': 'စိန်ခေါ်',
  'coup.block': '{character} ဖြင့် ပိတ်ဆို့',
  'coup.pass': 'ခွင့်ပြု',
  'coup.yourLoss.title': 'ဩဇာတစ်ခု စွန့်ပါ',
  'coup.yourLoss.coup': 'သင် ကူးခံရသည်။',
  'coup.yourLoss.assassinate': 'သင် လုပ်ကြံခံရသည်။',
  'coup.yourLoss.challengeLost': 'သင့်စိန်ခေါ်မှု မှားယွင်းသည်။',
  'coup.yourLoss.bluffCaught': 'သင့်လိမ်မှုကို ဖမ်းမိသည်။',
  'coup.exchange.title': 'ကတ် {n} ခု ထားပါ',
  'coup.exchange.hint': 'ထားမည့်ကတ်များ ရွေးပါ။ ကျန်သည်များ ကတ်ထုပ်သို့ ပြန်သွားမည်။',
  'coup.exchange.confirm': 'အတည်ပြု',

  // --- narration -------------------------------------------------------------
  'coup.event.action': '{name} က {action} ကြေညာသည်။',
  'coup.event.block': '{name} က {character} ဖြင့် ပိတ်ဆို့သည်။',
  'coup.event.challengeWon': '{name} က လိမ်သည်ဟု ဖော်ထုတ်သည် — {target} တွင် {character} မရှိပါ။',
  'coup.event.challengeLost':
    '{name} စိန်ခေါ်ရာ မှားယွင်းသည် — {target} တွင် {character} ရှိပြီး ၎င်းကို ကတ်ထုပ်အောက်သို့ ပြန်ထည့်ကာ အပေါ်ဆုံးကတ်ကို ယူလိုက်သည်။',
  'coup.event.lose': '{name} သည် {character} ကို စွန့်လိုက်သည်။',
  'coup.event.out': '{name} ဂိမ်းမှ ထွက်သွားသည်။',
  'coup.winner': '{name} အနိုင်ရသည်!',
  'coup.draw': 'ကျန်ရစ်သူ မရှိပါ',

  // --- the quick reference ---------------------------------------------------
  'coup.rules.open': 'စည်းမျဉ်း',
  'coup.rules.title': 'ကူး — အမြန်ကိုးကား',
  'coup.rules.close': 'ပိတ်ရန်',
  'coup.rules.aim':
    'လှျို့ဝှက် ဩဇာကတ် {influence} ခုနှင့် ဒင်္ဂါး {coins} ခုဖြင့် စတင်သည်။ အလှည့်တစ်ခုလျှင် လုပ်ဆောင်ချက်တစ်ခုသာ ယူပြီး သင်လိုချင်သည့် ဇာတ်ကောင်ကို ပိုင်ဆိုင်ကြောင်း ဆိုနိုင်သည် — အမှန်ဖြစ်စေ၊ မဟုတ်စေ။ ကတ်နှစ်ခုလုံး ဆုံးရှုံးလျှင် ထွက်ရမည်။ ဩဇာကျန်သည့် နောက်ဆုံးကစားသမား အနိုင်ရသည်။',
  'coup.rules.actions': 'လုပ်ဆောင်ချက်များ',
  'coup.rules.col.action': 'လုပ်ဆောင်ချက်',
  'coup.rules.col.cost': 'ကုန်ကျစရိတ်',
  'coup.rules.col.claims': 'ဆိုသည့်ဇာတ်ကောင်',
  'coup.rules.col.blockedBy': 'ပိတ်ဆို့နိုင်သူ',
  'coup.rules.anyone': 'မည်သူမဆို',
  'coup.rules.nothing': 'မရှိ',
  'coup.rules.challenges': 'စိန်ခေါ်မှုနှင့် ပိတ်ဆို့မှု',
  'coup.rules.challenge.who':
    'ပြိုင်ဘက်တိုင်း ဆိုထားသည့် ဇာတ်ကောင်ကို စိန်ခေါ်နိုင်သည်။ ပထမဆုံး စိန်ခေါ်မှု သို့မဟုတ် ပိတ်ဆို့မှုက ပြတင်းပေါက်ကို ပိတ်သည်။ ကျန်သူများမှာ ခွင့်ပြုရုံသာ။',
  'coup.rules.challenge.right':
    'စိန်ခေါ်မှု မှန်လျှင် — လိမ်သူသည် ဩဇာတစ်ခု စွန့်ရပြီး လုပ်ဆောင်ချက် မဖြစ်တော့ပါ။',
  'coup.rules.challenge.wrong':
    'စိန်ခေါ်မှု မှားလျှင် — သင် ဩဇာတစ်ခု စွန့်ရမည်။ ထိုသူက ကတ်ကိုပြပြီး ကတ်ထုပ်အောက်သို့ ပြန်ထည့်ကာ အပေါ်ဆုံးကတ်ကို ယူသည်။',
  'coup.rules.challenge.block':
    'ပိတ်ဆို့မှုသည်လည်း ဆိုချက်တစ်ခုဖြစ်၍ စိန်ခေါ်နိုင်သည် — သို့သော် ၎င်းကြောင့် ထိခိုက်သူကသာ။',
  'coup.rules.challenge.cost':
    'ဆိုချက် မှန်ကြောင်း သက်သေပြပြီးသော်လည်း ပိတ်ဆို့နိုင်သည့် လုပ်ဆောင်ချက်ကို ပိတ်ဆို့ခွင့် ကျန်ရှိသေးသည်။',
  'coup.rules.money': 'ဒင်္ဂါးများ',
  'coup.rules.money.coup': 'ကူးတစ်ခုလျှင် ဒင်္ဂါး {cost} ခု ကုန်ကျပြီး စိန်ခေါ်၍လည်းမရ၊ ပိတ်ဆို့၍လည်း မရပါ။',
  'coup.rules.money.forced': 'ဒင်္ဂါး {at} ခုရှိလျှင် ကူးသာလျှင် ယူနိုင်သည့် တစ်ခုတည်းသော လုပ်ဆောင်ချက်ဖြစ်သည်။',
  'coup.rules.money.assassin':
    'ကုန်ကျစရိတ်ကို ကြေညာချိန်တွင် ပေးရပြီး ဘယ်တော့မှ ပြန်မရပါ — ပိတ်ဆို့ခံရသည့် သို့မဟုတ် ဖမ်းမိသည့် လုပ်ကြံမှုသည်လည်း ဒင်္ဂါး {cost} ခု ကုန်ကျမြဲဖြစ်သည်။',
  'coup.rules.timeout':
    'အချိန်ကုန်လျှင် အန္တရာယ်အနည်းဆုံး တရားဝင်ရွေးချယ်မှုကို သင့်ကိုယ်စား ပြုလုပ်ပေးမည် — ပြတင်းပေါက်ကို ခွင့်ပြု၊ ဩဇာစွန့်ရလျှင် ပထမကတ်ကိုပေး၊ အလှည့်ဖြစ်လျှင် ဝင်ငွေယူသည်။',
}
