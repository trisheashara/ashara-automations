(() => {
  const MODULE_ID = "ashara-automations";
  const MODULE_TITLE = "Ashara Automations";

  const SPELLS = {
    aid: {
      key: "aid",
      names: ["aid", "aide"]
    },
    longstrider: {
      key: "longstrider",
      names: ["longstrider", "grandes foulées", "grandes foulees"]
    },
    darkvision: {
      key: "darkvision",
      names: ["darkvision", "vision dans le noir"]
    },
    mageArmor: {
      key: "mageArmor",
      names: ["mage armor", "armure du mage"]
    },
    shieldOfFaith: {
      key: "shieldOfFaith",
      names: ["shield of faith", "bouclier de la foi"]
    },
    falseLife: {
      key: "falseLife",
      names: ["false life", "simulacre de vie"]
    },
    heroism: {
      key: "heroism",
      names: ["heroism", "héroïsme", "heroisme"]
    },
    armorOfAgathys: {
      key: "armorOfAgathys",
      names: ["armor of agathys", "armure d'agathys", "armure d’agathys"]
    },
    protectionEvilGood: {
      key: "protectionEvilGood",
      names: [
        "protection from evil and good",
        "protection contre le mal et le bien",
        "protection contre le bien et le mal"
      ]
    },
    expeditiousRetreat: {
      key: "expeditiousRetreat",
      names: ["expeditious retreat", "repli expéditif", "repli expeditif"]
    },
    jump: {
      key: "jump",
      names: ["jump", "saut"]
    },
    hex: {
      key: "hex",
      names: ["hex", "maléfice", "malefice"]
    },
    huntersMark: {
      key: "huntersMark",
      names: ["hunter's mark", "hunters mark", "marque du chasseur", "hunter’s mark"]
    },
    sanctuary: {
      key: "sanctuary",
      names: ["sanctuary", "sanctuaire", "sanctuary / sanctuaire", "sanctuaire / sanctuary"]
    }
  };

  const controlledItemUuids = new Set();

  function log(...args) {
    console.log(`${MODULE_TITLE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_TITLE} |`, ...args);
  }

  function error(...args) {
    console.error(`${MODULE_TITLE} |`, ...args);
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isNameIn(name, list) {
    const n = normalizeName(name);
    return list.map(normalizeName).includes(n);
  }

  function getControlledSpellKey(name) {
    for (const spell of Object.values(SPELLS)) {
      if (isNameIn(name, spell.names)) return spell.key;
    }

    return null;
  }

  function isControlledSpellName(name) {
    return !!getControlledSpellKey(name);
  }

  function refreshControlledItemUuids() {
    controlledItemUuids.clear();

    for (const actor of game.actors ?? []) {
      for (const item of actor.items ?? []) {
        if (isControlledSpellName(item.name)) {
          controlledItemUuids.add(item.uuid);
        }
      }
    }

    for (const item of game.items ?? []) {
      if (isControlledSpellName(item.name)) {
        controlledItemUuids.add(item.uuid);
      }
    }

    log(`Sorts contrôlés recensés : ${controlledItemUuids.size}`);
  }

  function getHp(actor) {
    return actor.system?.attributes?.hp ?? {};
  }

  function getWalkSpeed(actor) {
    return Number(actor.system?.attributes?.movement?.walk || 0);
  }

  function getDarkvision(actor) {
    return Number(actor.system?.attributes?.senses?.ranges?.darkvision || 0);
  }

  function getAsharaEffect(actor, key) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, "key") === key);
  }

  async function deleteAsharaEffect(actor, key) {
    const effect = getAsharaEffect(actor, key);

    if (effect) {
      await effect.delete();
    }
  }

  async function createMarkerEffect(actor, { key, name, icon, durationSeconds, data = {}, changes = [] }) {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name,
      icon,
      disabled: false,
      duration: {
        seconds: Number(durationSeconds || 0),
        startTime: game.time.worldTime
      },
      changes,
      flags: {
        [MODULE_ID]: {
          key,
          ...data
        }
      }
    }]);
  }

  function getTargetActorsForItem(item, { requireExplicitTarget = false } = {}) {
    const targeted = Array.from(game.user.targets || [])
      .map(t => t.actor)
      .filter(Boolean);

    if (targeted.length) return targeted;

    const selected = Array.from(canvas.tokens?.controlled || [])
      .map(t => t.actor)
      .filter(Boolean);

    if (selected.length) return selected;

    if (requireExplicitTarget) return [];

    if (item?.actor) return [item.actor];

    return [];
  }

  async function removeAid(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "aid");
    if (!data) return false;

    const bonus = Number(data.bonus || 0);
    const hp = getHp(actor);

    const currentHp = Number(hp.value || 0);
    const maxHp = Number(hp.max || 0);
    const currentTempMax = Number(hp.tempmax || 0);

    const newTempMax = Math.max(0, currentTempMax - bonus);
    const newHp = Math.min(currentHp, maxHp + newTempMax);

    await actor.update({
      "system.attributes.hp.tempmax": newTempMax,
      "system.attributes.hp.value": newHp
    });

    await actor.unsetFlag(MODULE_ID, "aid");

    log("Aid retiré", {
      actor: actor.name,
      bonus,
      reason,
      oldTempMax: currentTempMax,
      newTempMax,
      oldHp: currentHp,
      newHp
    });

    return true;
  }

  async function applyAid(actor, spellLevel = 2) {
    spellLevel = Number(spellLevel || 2);

    if (spellLevel < 2) spellLevel = 2;
    if (spellLevel > 9) spellLevel = 9;

    const key = "aid";
    const bonus = 5 * (spellLevel - 1);
    const durationSeconds = 8 * 60 * 60;

    await deleteAsharaEffect(actor, key);

    const hp = getHp(actor);

    const currentHp = Number(hp.value || 0);
    const maxHp = Number(hp.max || 0);
    const currentTempMax = Number(hp.tempmax || 0);

    const newTempMax = currentTempMax + bonus;
    const newHp = Math.min(currentHp + bonus, maxHp + newTempMax);

    await actor.update({
      "system.attributes.hp.tempmax": newTempMax,
      "system.attributes.hp.value": newHp
    });

    await actor.setFlag(MODULE_ID, "aid", {
      bonus,
      spellLevel,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `Aid - Ashara +${bonus} PV max`,
      icon: "icons/magic/life/cross-area-circle-green-white.webp",
      durationSeconds,
      data: {
        spell: "aid",
        bonus,
        spellLevel
      }
    });

    log("Aid appliqué", {
      actor: actor.name,
      spellLevel,
      bonus,
      oldHp: currentHp,
      newHp,
      oldTempMax: currentTempMax,
      newTempMax
    });

    return true;
  }

  async function removeLongstrider(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "longstrider");
    if (!data) return false;

    const currentWalk = getWalkSpeed(actor);
    const previousWalk = Number(data.previousWalk || 0);

    await actor.update({
      "system.attributes.movement.walk": previousWalk
    });

    await actor.unsetFlag(MODULE_ID, "longstrider");

    log("Longstrider retiré", {
      actor: actor.name,
      reason,
      currentWalk,
      restoredWalk: previousWalk
    });

    return true;
  }

  async function applyLongstrider(actor) {
    const key = "longstrider";
    const bonus = 10;
    const durationSeconds = 60 * 60;

    await deleteAsharaEffect(actor, key);

    const previousWalk = getWalkSpeed(actor);
    const newWalk = previousWalk + bonus;

    await actor.update({
      "system.attributes.movement.walk": newWalk
    });

    await actor.setFlag(MODULE_ID, "longstrider", {
      bonus,
      previousWalk,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Longstrider - Ashara +10 ft",
      icon: "icons/magic/movement/trail-streak-zigzag-yellow.webp",
      durationSeconds,
      data: {
        spell: "longstrider",
        bonus,
        previousWalk
      }
    });

    log("Longstrider appliqué", {
      actor: actor.name,
      previousWalk,
      newWalk
    });

    return true;
  }

  async function removeDarkvision(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "darkvision");
    if (!data) return false;

    const previousDarkvision = Number(data.previousDarkvision || 0);
    const currentDarkvision = getDarkvision(actor);

    await actor.update({
      "system.attributes.senses.ranges.darkvision": previousDarkvision
    });

    await actor.unsetFlag(MODULE_ID, "darkvision");

    log("Darkvision retiré", {
      actor: actor.name,
      reason,
      currentDarkvision,
      restoredDarkvision: previousDarkvision
    });

    return true;
  }

  async function applyDarkvision(actor, range = 60) {
    const key = "darkvision";
    const durationSeconds = 8 * 60 * 60;

    range = Number(range || 60);

    await deleteAsharaEffect(actor, key);

    const previousDarkvision = getDarkvision(actor);
    const newDarkvision = Math.max(previousDarkvision, range);

    await actor.update({
      "system.attributes.senses.ranges.darkvision": newDarkvision
    });

    await actor.setFlag(MODULE_ID, "darkvision", {
      range,
      previousDarkvision,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `Darkvision - Ashara ${range} ft`,
      icon: "icons/magic/perception/eye-ringed-green.webp",
      durationSeconds,
      data: {
        spell: "darkvision",
        range,
        previousDarkvision
      }
    });

    log("Darkvision appliqué", {
      actor: actor.name,
      previousDarkvision,
      newDarkvision
    });

    return true;
  }

  async function askAidLevel() {
    return new Promise(resolve => {
      new Dialog({
        title: "Aid / Aide - Ashara",
        content: `
          <form>
            <div class="form-group">
              <label>Niveau du sort utilisé</label>
              <select id="aid-level">
                <option value="2">Niveau 2 : +5 PV max</option>
                <option value="3">Niveau 3 : +10 PV max</option>
                <option value="4">Niveau 4 : +15 PV max</option>
                <option value="5">Niveau 5 : +20 PV max</option>
                <option value="6">Niveau 6 : +25 PV max</option>
                <option value="7">Niveau 7 : +30 PV max</option>
                <option value="8">Niveau 8 : +35 PV max</option>
                <option value="9">Niveau 9 : +40 PV max</option>
              </select>
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "Appliquer",
            callback: html => resolve(Number(html.find("#aid-level").val()))
          },
          cancel: {
            label: "Annuler",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
  }

  async function askDarkvisionRange() {
    return new Promise(resolve => {
      new Dialog({
        title: "Darkvision / Vision dans le noir - Ashara",
        content: `
          <form>
            <div class="form-group">
              <label>Portée</label>
              <select id="darkvision-range">
                <option value="60">60 ft</option>
                <option value="120">120 ft</option>
                <option value="300">300 ft</option>
              </select>
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "Appliquer",
            callback: html => resolve(Number(html.find("#darkvision-range").val()))
          },
          cancel: {
            label: "Annuler",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
  }


  function getAcBonus(actor) {
    const raw = actor.system?.attributes?.ac?.bonus ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function getAcCalc(actor) {
    return actor.system?.attributes?.ac?.calc ?? "";
  }

  function getTempHp(actor) {
    return Number(actor.system?.attributes?.hp?.temp || 0);
  }

  async function removeMageArmor(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "mageArmor");
    if (!data) return false;

    const previousCalc = data.previousCalc ?? "";

    await actor.update({
      "system.attributes.ac.calc": previousCalc
    });

    await actor.unsetFlag(MODULE_ID, "mageArmor");

    log("Mage Armor retiré", {
      actor: actor.name,
      reason,
      restoredCalc: previousCalc
    });

    return true;
  }

  async function applyMageArmor(actor) {
    const key = "mageArmor";
    const durationSeconds = 8 * 60 * 60;
    const previousCalc = getAcCalc(actor);

    await deleteAsharaEffect(actor, key);

    await actor.update({
      "system.attributes.ac.calc": "mage"
    });

    await actor.setFlag(MODULE_ID, "mageArmor", {
      previousCalc,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Mage Armor - Ashara",
      icon: "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
      durationSeconds,
      data: {
        spell: "mageArmor",
        previousCalc
      }
    });

    log("Mage Armor appliqué", {
      actor: actor.name,
      previousCalc,
      newCalc: "mage"
    });

    return true;
  }

  async function removeShieldOfFaith(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "shieldOfFaith");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "shieldOfFaith");

    log("Shield of Faith retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function applyShieldOfFaith(actor) {
    const key = "shieldOfFaith";
    const durationSeconds = 10 * 60;

    await deleteAsharaEffect(actor, key);

    await actor.setFlag(MODULE_ID, "shieldOfFaith", {
      bonus: 2,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Shield of Faith - Ashara +2 AC",
      icon: "icons/svg/shield.svg",
      durationSeconds,
      changes: [
        {
          key: "system.attributes.ac.bonus",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: "2",
          priority: 20
        }
      ],
      data: {
        spell: "shieldOfFaith",
        bonus: 2
      }
    });

    log("Shield of Faith appliqué via Active Effect", {
      actor: actor.name,
      bonus: 2,
      acBefore: actor.system?.attributes?.ac?.value
    });

    setTimeout(() => {
      log("Shield of Faith vérification AC après refresh", {
        actor: actor.name,
        acAfter: actor.system?.attributes?.ac?.value,
        acBonus: actor.system?.attributes?.ac?.bonus
      });
    }, 500);

    return true;
  }

  async function removeFalseLife(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "falseLife");
    if (!data) return false;

    const previousTemp = Number(data.previousTemp || 0);
    const appliedTemp = Number(data.appliedTemp || 0);
    const currentTemp = getTempHp(actor);

    let newTemp = currentTemp;

    if (currentTemp <= appliedTemp) {
      newTemp = previousTemp;
      await actor.update({
        "system.attributes.hp.temp": newTemp
      });
    }

    await actor.unsetFlag(MODULE_ID, "falseLife");

    log("False Life retiré", {
      actor: actor.name,
      reason,
      previousTemp,
      appliedTemp,
      currentTemp,
      newTemp
    });

    return true;
  }

  async function applyFalseLife(actor, amount) {
    const key = "falseLife";
    const durationSeconds = 60 * 60;

    amount = Number(amount || 0);
    if (amount <= 0) return false;

    await deleteAsharaEffect(actor, key);

    const previousTemp = getTempHp(actor);
    const newTemp = Math.max(previousTemp, amount);

    await actor.update({
      "system.attributes.hp.temp": newTemp
    });

    await actor.setFlag(MODULE_ID, "falseLife", {
      previousTemp,
      appliedTemp: newTemp,
      amount,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `False Life - Ashara ${newTemp} PV temp`,
      icon: "icons/magic/death/skull-horned-goat-pentagram-red.webp",
      durationSeconds,
      data: {
        spell: "falseLife",
        previousTemp,
        appliedTemp: newTemp,
        amount
      }
    });

    log("False Life appliqué", {
      actor: actor.name,
      previousTemp,
      amount,
      newTemp
    });

    return true;
  }

  async function removeHeroism(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "heroism");
    if (!data) return false;

    const previousTemp = Number(data.previousTemp || 0);
    const tempPerTurn = Number(data.tempPerTurn || 0);
    const currentTemp = getTempHp(actor);
    const heroismRaisedTemp = data.heroismRaisedTemp === true;

    let newTemp = currentTemp;

    // Règle Ashara :
    // Si Heroism n'a jamais remplacé une valeur plus basse, on ne touche pas aux PV temp existants.
    // Exemple : tu avais 10 PV temp, Heroism donne 5 → tu gardes 10, et retirer Heroism ne change rien.
    if (heroismRaisedTemp && currentTemp <= tempPerTurn) {
      newTemp = previousTemp;
      await actor.update({
        "system.attributes.hp.temp": newTemp
      });
    }

    await actor.unsetFlag(MODULE_ID, "heroism");

    log("Heroism retiré", {
      actor: actor.name,
      reason,
      previousTemp,
      tempPerTurn,
      currentTemp,
      newTemp,
      heroismRaisedTemp
    });

    return true;
  }

  async function applyHeroism(actor, tempPerTurn) {
    const key = "heroism";
    const durationSeconds = 60;

    tempPerTurn = Number(tempPerTurn || 0);
    if (tempPerTurn <= 0) return false;

    await deleteAsharaEffect(actor, key);

    const previousTemp = getTempHp(actor);
    const newTemp = Math.max(previousTemp, tempPerTurn);
    const heroismRaisedTemp = newTemp > previousTemp;

    await actor.update({
      "system.attributes.hp.temp": newTemp
    });

    await actor.setFlag(MODULE_ID, "heroism", {
      previousTemp,
      tempPerTurn,
      heroismRaisedTemp,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `Heroism - Ashara ${tempPerTurn} PV temp/tour`,
      icon: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
      durationSeconds,
      data: {
        spell: "heroism",
        previousTemp,
        tempPerTurn,
        heroismRaisedTemp
      }
    });

    log("Heroism appliqué", {
      actor: actor.name,
      previousTemp,
      tempPerTurn,
      newTemp,
      heroismRaisedTemp
    });

    return true;
  }

  async function refreshHeroism(actor) {
    const data = actor.getFlag(MODULE_ID, "heroism");
    if (!data) return false;

    const tempPerTurn = Number(data.tempPerTurn || 0);
    const currentTemp = getTempHp(actor);

    // Les PV temporaires ne se cumulent pas et ne remplacent jamais une valeur supérieure.
    // On applique seulement si Heroism donne plus que les PV temp actuels.
    if (tempPerTurn > currentTemp) {
      await actor.update({
        "system.attributes.hp.temp": tempPerTurn
      });

      await actor.setFlag(MODULE_ID, "heroism", {
        ...data,
        heroismRaisedTemp: true
      });

      log("Heroism rafraîchi début de tour", {
        actor: actor.name,
        oldTemp: currentTemp,
        newTemp: tempPerTurn
      });
    } else {
      log("Heroism non rafraîchi : PV temporaires actuels supérieurs ou égaux", {
        actor: actor.name,
        currentTemp,
        tempPerTurn
      });
    }

    return true;
  }

  async function removeArmorOfAgathys(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "armorOfAgathys");
    if (!data) return false;

    const previousTemp = Number(data.previousTemp || 0);
    const appliedTemp = Number(data.appliedTemp || 0);
    const currentTemp = getTempHp(actor);

    let newTemp = currentTemp;

    if (currentTemp <= appliedTemp) {
      newTemp = previousTemp;
      await actor.update({
        "system.attributes.hp.temp": newTemp
      });
    }

    await actor.unsetFlag(MODULE_ID, "armorOfAgathys");

    log("Armor of Agathys retiré", {
      actor: actor.name,
      reason,
      previousTemp,
      appliedTemp,
      currentTemp,
      newTemp
    });

    return true;
  }

  async function applyArmorOfAgathys(actor, spellLevel = 1) {
    const key = "armorOfAgathys";
    const durationSeconds = 60 * 60;

    spellLevel = Number(spellLevel || 1);
    if (spellLevel < 1) spellLevel = 1;
    if (spellLevel > 9) spellLevel = 9;

    const amount = 5 * spellLevel;

    await deleteAsharaEffect(actor, key);

    const previousTemp = getTempHp(actor);
    const newTemp = Math.max(previousTemp, amount);

    await actor.update({
      "system.attributes.hp.temp": newTemp
    });

    await actor.setFlag(MODULE_ID, "armorOfAgathys", {
      previousTemp,
      appliedTemp: newTemp,
      spellLevel,
      amount,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `Armor of Agathys - Ashara ${amount} PV temp`,
      icon: "icons/magic/water/barrier-ice-shield.webp",
      durationSeconds,
      data: {
        spell: "armorOfAgathys",
        previousTemp,
        appliedTemp: newTemp,
        spellLevel,
        amount
      }
    });

    log("Armor of Agathys appliqué", {
      actor: actor.name,
      spellLevel,
      amount,
      previousTemp,
      newTemp
    });

    return true;
  }


  const agathysHandledWorkflows = new Set();

  function getArmorOfAgathysDamage(actor) {
    const data = actor?.getFlag?.(MODULE_ID, "armorOfAgathys");
    if (!data) return 0;

    const amount = Number(data.amount || 0);
    const tempHp = getTempHp(actor);

    if (amount <= 0) return 0;
    if (tempHp <= 0) return 0;

    return amount;
  }

  function isLikelyMeleeAttack(workflow) {
    const item = workflow?.item;
    const activity = workflow?.activity;

    const actionType = String(
      item?.system?.actionType ||
      activity?.actionType ||
      activity?.attack?.type ||
      activity?.type ||
      ""
    ).toLowerCase();

    const rangeValue = Number(
      item?.system?.range?.value ??
      activity?.range?.value ??
      0
    );

    const rangeUnits = String(
      item?.system?.range?.units ||
      activity?.range?.units ||
      ""
    ).toLowerCase();

    const itemName = String(item?.name || "").toLowerCase();

    if (actionType === "mwak" || actionType === "msak") return true;
    if (actionType.includes("melee")) return true;
    if (rangeUnits.includes("touch")) return true;
    if (rangeValue > 0 && rangeValue <= 10 && !rangeUnits.includes("ft")) return true;

    const meleeWords = [
      "bite", "claw", "slam", "gore", "hoof", "tusk",
      "morsure", "griffes", "griffe", "coup", "corne", "sabot"
    ];

    if (meleeWords.some(w => itemName.includes(w))) return true;


    


    return false;
  }

  async function applyColdDamageToActor(actor, amount, flavor = "Armor of Agathys - Ashara") {
    amount = Number(amount || 0);
    if (!actor || amount <= 0) return false;

    const hp = actor.system?.attributes?.hp ?? {};
    const currentTemp = Number(hp.temp || 0);
    const currentHp = Number(hp.value || 0);

    let remaining = amount;
    let newTemp = currentTemp;
    let newHp = currentHp;

    if (newTemp > 0) {
      const absorbed = Math.min(newTemp, remaining);
      newTemp -= absorbed;
      remaining -= absorbed;
    }

    if (remaining > 0) {
      newHp = Math.max(0, newHp - remaining);
    }

    await actor.update({
      "system.attributes.hp.temp": newTemp,
      "system.attributes.hp.value": newHp
    });

    ChatMessage.create({
      content: `<b>${flavor}</b><br>${actor.name} subit <b>${amount}</b> dégâts de froid.`
    });

    log("Dégâts de froid appliqués", {
      actor: actor.name,
      amount,
      oldHp: currentHp,
      newHp,
      oldTemp: currentTemp,
      newTemp
    });

    return true;
  }

  async function handleArmorOfAgathysRetaliation(workflow) {
    if (!workflow) return false;

    const workflowId = workflow.uuid || workflow.id || workflow._id || `${Date.now()}-${Math.random()}`;

    if (agathysHandledWorkflows.has(workflowId)) return false;
    agathysHandledWorkflows.add(workflowId);

    setTimeout(() => agathysHandledWorkflows.delete(workflowId), 30000);

    if (!isLikelyMeleeAttack(workflow)) {
      log("Armor of Agathys ignoré : attaque non identifiée comme mêlée", {
        item: workflow?.item?.name,
        actionType: workflow?.item?.system?.actionType
      });
      return false;
    }

    const attackerActor = workflow.actor;
    if (!attackerActor) return false;

    const hitTargets = Array.from(
      workflow.hitTargets ||
      workflow.hitTargetsEC ||
      []
    );

    if (!hitTargets.length) {
      log("Armor of Agathys ignoré : aucune cible touchée détectée.");
      return false;
    }

    let applied = false;

    for (const targetToken of hitTargets) {
      const targetActor = targetToken?.actor;
      if (!targetActor) continue;

      const coldDamage = getArmorOfAgathysDamage(targetActor);
      if (coldDamage <= 0) continue;

      await applyColdDamageToActor(
        attackerActor,
        coldDamage,
        `Armor of Agathys / Armure d’Agathys - Ashara`
      );

      ChatMessage.create({
        content: `<b>Armor of Agathys / Armure d’Agathys - Ashara</b><br>${targetActor.name} est touché en mêlée : ${attackerActor.name} reçoit <b>${coldDamage}</b> dégâts de froid.`
      });

      log("Armor of Agathys riposte", {
        protectedActor: targetActor.name,
        attacker: attackerActor.name,
        coldDamage
      });

      applied = true;
    }

    return applied;
  }


  async function removeProtectionEvilGood(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "protectionEvilGood");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "protectionEvilGood");

    log("Protection from Evil and Good retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function applyProtectionEvilGood(actor) {
    const key = "protectionEvilGood";
    const durationSeconds = 10 * 60;

    await deleteAsharaEffect(actor, key);

    await actor.setFlag(MODULE_ID, "protectionEvilGood", {
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Protection from Evil and Good - Ashara",
      icon: "icons/svg/shield.svg",
      durationSeconds,
      data: {
        spell: "protectionEvilGood"
      }
    });

    log("Protection from Evil and Good appliqué", {
      actor: actor.name
    });

    return true;
  }

  async function askSpellLevel(title, min = 1, max = 9) {
    const options = [];

    for (let i = min; i <= max; i++) {
      options.push(`<option value="${i}">Niveau ${i}</option>`);
    }

    return new Promise(resolve => {
      new Dialog({
        title,
        content: `
          <form>
            <div class="form-group">
              <label>Niveau du sort utilisé</label>
              <select id="spell-level">
                ${options.join("")}
              </select>
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "Appliquer",
            callback: html => resolve(Number(html.find("#spell-level").val()))
          },
          cancel: {
            label: "Annuler",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
  }

  async function askNumber(title, label, defaultValue = 1) {
    return new Promise(resolve => {
      new Dialog({
        title,
        content: `
          <form>
            <div class="form-group">
              <label>${label}</label>
              <input id="ashara-number" type="number" value="${defaultValue}" min="0" step="1"/>
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "Appliquer",
            callback: html => resolve(Number(html.find("#ashara-number").val()))
          },
          cancel: {
            label: "Annuler",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
  }

  async function rollFalseLife(spellLevel = 1) {
    spellLevel = Number(spellLevel || 1);
    if (spellLevel < 1) spellLevel = 1;
    if (spellLevel > 9) spellLevel = 9;

    const flat = 4 + Math.max(0, spellLevel - 1) * 5;
    const roll = await new Roll(`2d4 + ${flat}`).evaluate();

    await roll.toMessage({
      flavor: `False Life / Simulacre de vie - Ashara niveau ${spellLevel}`
    });

    return roll.total;
  }



  async function removeExpeditiousRetreat(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "expeditiousRetreat");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "expeditiousRetreat");

    log("Expeditious Retreat retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function applyExpeditiousRetreat(actor) {
    const key = "expeditiousRetreat";
    const durationSeconds = 10 * 60;

    await deleteAsharaEffect(actor, key);

    await actor.setFlag(MODULE_ID, "expeditiousRetreat", {
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Expeditious Retreat - Ashara",
      icon: "icons/svg/wingfoot.svg",
      durationSeconds,
      data: {
        spell: "expeditiousRetreat"
      }
    });

    log("Expeditious Retreat appliqué", {
      actor: actor.name
    });

    return true;
  }

  async function removeJump(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "jump");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "jump");

    log("Jump retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function applyJump(actor) {
    const key = "jump";
    const durationSeconds = 60;

    await deleteAsharaEffect(actor, key);

    await actor.setFlag(MODULE_ID, "jump", {
      multiplier: 3,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: "Jump - Ashara x3",
      icon: "icons/svg/up.svg",
      durationSeconds,
      data: {
        spell: "jump",
        multiplier: 3
      }
    });

    log("Jump appliqué", {
      actor: actor.name,
      multiplier: 3
    });

    return true;
  }

  async function removeSanctuary(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "sanctuary");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "sanctuary");

    log("Sanctuary retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  function getCasterSpellDc(item) {
    const actor = item?.actor || item?.parent;
    const dc = Number(
      actor?.system?.attributes?.spell?.dc ??
      actor?.system?.attributes?.spelldc ??
      item?.system?.save?.dc ??
      0
    );

    if (Number.isFinite(dc) && dc > 0) return dc;
    return 10;
  }

  async function applySanctuary(actor, item) {
    const key = "sanctuary";
    const durationSeconds = 60;
    const saveDc = getCasterSpellDc(item);

    await deleteAsharaEffect(actor, key);

    await actor.setFlag(MODULE_ID, "sanctuary", {
      saveDc,
      appliedAt: Date.now()
    });

    await createMarkerEffect(actor, {
      key,
      name: `Sanctuary - Ashara DC ${saveDc}`,
      icon: "icons/svg/aura.svg",
      durationSeconds,
      data: {
        spell: "sanctuary",
        saveDc
      }
    });

    const matchingTokens = Array.from(canvas?.tokens?.placeables || []).filter(token => {
      if (!token?.actor) return false;
      if (token.actor === actor) return true;
      if (token.actor?.uuid && actor?.uuid && token.actor.uuid === actor.uuid) return true;
      if (token.actor?.id && actor?.id && token.actor.id === actor.id) return true;
      return token.actor?.name === actor?.name;
    });

    for (const token of matchingTokens) {
      try {
        await token.document.setFlag(MODULE_ID, "sanctuary", {
          saveDc,
          actorUuid: actor.uuid,
          actorId: actor.id,
          actorName: actor.name,
          appliedAt: Date.now()
        });
      } catch (err) {
        log("Sanctuary : impossible de poser le flag sur le token", {
          token: token.name,
          actor: actor.name,
          err
        });
      }
    }

    log("Sanctuary appliqué", {
      actor: actor.name,
      saveDc,
      tokens: matchingTokens.map(t => t.name)
    });

    return true;
  }

  function hasSanctuary(actor) {
    if (!actor) return false;

    const flag = actor.getFlag?.(MODULE_ID, "sanctuary");
    if (!flag) return false;

    const effect = actor.effects?.find(e => e.getFlag(MODULE_ID, "key") === "sanctuary");

    if (effect && effect.disabled) return false;

    return true;
  }

  function getSanctuarySaveDc(actor, tokenOrDocument = null) {
    const actorDc = Number(actor?.getFlag?.(MODULE_ID, "sanctuary")?.saveDc || 0);
    if (Number.isFinite(actorDc) && actorDc > 0) return actorDc;

    const tokenDc = Number(tokenOrDocument?.getFlag?.(MODULE_ID, "sanctuary")?.saveDc || 0);
    if (Number.isFinite(tokenDc) && tokenDc > 0) return tokenDc;

    const documentDc = Number(tokenOrDocument?.document?.getFlag?.(MODULE_ID, "sanctuary")?.saveDc || 0);
    if (Number.isFinite(documentDc) && documentDc > 0) return documentDc;

    return 10;
  }

  function getSanctuaryWorkflowTargets(workflow) {
    const result = [];

    function normalize(entry) {
      if (!entry) return null;

      const token = entry.object || entry.token || entry;
      const document = entry.document || entry;
      const actor =
        entry.actor ||
        entry.document?.actor ||
        entry.object?.actor ||
        entry.token?.actor ||
        null;

      if (!actor) return null;

      return {
        raw: entry,
        token,
        document,
        actor,
        name: entry.name || token?.name || document?.name || actor.name || "Cible"
      };
    }

    function collect(set) {
      if (!set) return;

      for (const entry of Array.from(set)) {
        const target = normalize(entry);
        if (target) result.push(target);
      }
    }

    collect(workflow?.targets);
    collect(workflow?.hitTargets);
    collect(workflow?.hitTargetsEC);
    collect(game.user?.targets);

    const byKey = new Map();

    for (const target of result) {
      const key =
        target.token?.id ||
        target.document?.id ||
        target.actor?.uuid ||
        target.actor?.id ||
        target.name;

      if (!byKey.has(key)) byKey.set(key, target);
    }

    return Array.from(byKey.values());
  }

  function isSanctuaryAttackWorkflow(workflow) {
    if (!workflow) return false;

    const item = workflow.item;
    const activity = workflow.activity;

    const actionType = String(
      item?.system?.actionType ||
      activity?.actionType ||
      activity?.attack?.type ||
      activity?.type ||
      ""
    ).toLowerCase();

    if (workflow.attackRoll) return true;
    if (workflow.isAttack) return true;

    return ["mwak", "rwak", "msak", "rsak"].includes(actionType) || actionType.includes("attack");
  }

  const sanctuaryHandledWorkflows = new Set();

  function getSanctuaryWorkflowId(workflow) {
    return workflow?.uuid || workflow?.id || workflow?._id || workflow?.item?.uuid || `${Date.now()}-${Math.random()}`;
  }

  async function rollSanctuaryWisdomSave(attacker, dc, targetName) {
    const attackerName = attacker?.name || "La créature";

    function safeNumber(value, fallback = 0) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    const wisMod =
      safeNumber(attacker?.system?.abilities?.wis?.mod, null) ??
      safeNumber(attacker?.system?.abilities?.wis?.save, null) ??
      safeNumber(attacker?.system?.abilities?.wis?.value, 10);

    let modifier = safeNumber(attacker?.system?.abilities?.wis?.mod, null);

    if (modifier === null) {
      const score = safeNumber(attacker?.system?.abilities?.wis?.value, 10);
      modifier = Math.floor((score - 10) / 2);
    }

    if (!Number.isFinite(modifier)) modifier = 0;

    const formula = modifier >= 0 ? `1d20 + ${modifier}` : `1d20 - ${Math.abs(modifier)}`;

    let roll;

    try {
      roll = await new Roll(formula).evaluate();
    } catch (err) {
      error("Sanctuary : échec du jet de sauvegarde custom, fallback 1d20 utilisé.", {
        attacker: attackerName,
        formula,
        modifier,
        err
      });

      roll = await new Roll("1d20").evaluate();
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      flavor: `<b>Sanctuary / Sanctuaire - Ashara</b><br>${attackerName} tente une sauvegarde de Sagesse contre DD ${dc} pour attaquer ${targetName}.`
    });

    const total = safeNumber(roll.total, 0);
    const success = total >= dc;

    return {
      roll,
      total,
      success
    };
  }

  function tryAbortSanctuaryWorkflow(workflow) {
    if (!workflow) return;

    workflow.aborted = true;
    workflow.abort = true;

    if (workflow.options) workflow.options.abort = true;
    if (workflow.workflowOptions) workflow.workflowOptions.abort = true;

    if (workflow.targets?.clear) workflow.targets.clear();
    if (workflow.hitTargets?.clear) workflow.hitTargets.clear();
    if (workflow.hitTargetsEC?.clear) workflow.hitTargetsEC.clear();

    try {
      if (typeof workflow.setTargets === "function") workflow.setTargets(new Set());
    } catch (err) {
      log("Sanctuary : impossible de vider les cibles via setTargets", err);
    }
  }

  async function askSanctuaryDecision(attacker, target, dc) {
    const attackerName = attacker?.name || "La créature";
    const targetName = target?.name || target?.actor?.name || "la cible";

    return new Promise(resolve => {
      new Dialog({
        title: "Sanctuary / Sanctuaire - Ashara",
        content: `
          <div>
            <p><b>${attackerName}</b> tente d'attaquer <b>${targetName}</b>, qui est sous <b>Sanctuary</b>.</p>
            <p>DD de sauvegarde de Sagesse : <b>${dc}</b></p>
            <p>Que veux-tu faire ?</p>
          </div>
        `,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Lancer le jet de Sagesse",
            callback: () => resolve("roll")
          },
          allow: {
            icon: '<i class="fas fa-check"></i>',
            label: "Autoriser l'attaque",
            callback: () => resolve("allow")
          },
          block: {
            icon: '<i class="fas fa-ban"></i>',
            label: "Bloquer l'attaque",
            callback: () => resolve("block")
          }
        },
        default: "roll",
        close: () => resolve("roll")
      }).render(true);
    });
  }

  async function sanctuaryReminder(workflow, source = "unknown") {
    if (!isSanctuaryAttackWorkflow(workflow)) return true;

    const workflowId = getSanctuaryWorkflowId(workflow);

    if (sanctuaryHandledWorkflows.has(workflowId)) return true;
    sanctuaryHandledWorkflows.add(workflowId);
    setTimeout(() => sanctuaryHandledWorkflows.delete(workflowId), 30000);

    const attacker = workflow.actor;
    if (!attacker) return true;

    const targets = getSanctuaryWorkflowTargets(workflow);

    const sanctuaryTargets = targets.filter(target => {
      const actorHas = hasSanctuary(target.actor);
      const tokenFlag = !!target.token?.document?.getFlag?.(MODULE_ID, "sanctuary");
      const documentFlag = !!target.document?.getFlag?.(MODULE_ID, "sanctuary");

      return actorHas || tokenFlag || documentFlag;
    });

    if (!sanctuaryTargets.length) {
      log("Sanctuary ignoré : aucune cible protégée détectée", {
        source,
        attacker: attacker.name,
        targets: targets.map(t => ({
          name: t.name,
          actor: t.actor?.name,
          actorFlag: !!t.actor?.getFlag?.(MODULE_ID, "sanctuary"),
          tokenFlag: !!t.token?.document?.getFlag?.(MODULE_ID, "sanctuary"),
          documentFlag: !!t.document?.getFlag?.(MODULE_ID, "sanctuary")
        }))
      });
      return true;
    }

    for (const target of sanctuaryTargets) {
      const dc = getSanctuarySaveDc(target.actor, target.token?.document || target.document);
      const decision = await askSanctuaryDecision(attacker, target, dc);

      if (decision === "allow") {
        ChatMessage.create({
          content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>Le MJ autorise l'attaque de ${attacker.name} contre ${target.name}.`
        });

        log("Sanctuary : attaque autorisée manuellement", {
          source,
          attacker: attacker.name,
          target: target.name,
          saveDc: dc
        });

        continue;
      }

      if (decision === "block") {
        tryAbortSanctuaryWorkflow(workflow);

        ChatMessage.create({
          content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>Le MJ bloque l'attaque de ${attacker.name} contre ${target.name}.`
        });

        ui.notifications.warn(`Sanctuary Ashara : attaque de ${attacker.name} bloquée.`);

        log("Sanctuary : attaque bloquée manuellement", {
          source,
          attacker: attacker.name,
          target: target.name,
          saveDc: dc
        });

        return false;
      }

      const result = await rollSanctuaryWisdomSave(attacker, dc, target.name);

      if (result.success) {
        ChatMessage.create({
          content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>${attacker.name} réussit sa sauvegarde de Sagesse contre DD ${dc} avec <b>${result.total}</b>.<br>L'attaque contre ${target.name} peut continuer.`
        });

        log("Sanctuary sauvegarde réussie", {
          source,
          attacker: attacker.name,
          target: target.name,
          saveDc: dc,
          total: result.total
        });
      } else {
        tryAbortSanctuaryWorkflow(workflow);

        ChatMessage.create({
          content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>${attacker.name} rate sa sauvegarde de Sagesse contre DD ${dc} avec <b>${result.total}</b>.<br><b>L'attaque contre ${target.name} doit être annulée ou redirigée vers une autre cible.</b>`
        });

        ui.notifications.warn(`Sanctuary Ashara : ${attacker.name} rate sa sauvegarde, l'attaque doit être annulée ou redirigée.`);

        log("Sanctuary sauvegarde ratée : attaque bloquée si possible", {
          source,
          attacker: attacker.name,
          target: target.name,
          saveDc: dc,
          total: result.total
        });

        return false;
      }
    }

    return true;
  }



  function getAsharaActorIdentity(actor) {
    if (!actor) return null;

    return {
      uuid: actor.uuid || "",
      id: actor.id || "",
      name: actor.name || ""
    };
  }

  function asharaSameActorIdentity(actor, identity = {}) {
    if (!actor) return false;

    if (identity.uuid && actor.uuid && identity.uuid === actor.uuid) return true;
    if (identity.id && actor.id && identity.id === actor.id) return true;
    if (identity.name && actor.name && identity.name === actor.name) return true;

    return false;
  }

  function getHuntersMarkDurationSeconds(spellLevel) {
    const level = Number(spellLevel || 1);

    if (level >= 5) return 24 * 60 * 60;
    if (level >= 3) return 8 * 60 * 60;

    return 60 * 60;
  }

  function getHuntersMarkDurationLabel(spellLevel) {
    const level = Number(spellLevel || 1);

    if (level >= 5) return "24 heures";
    if (level >= 3) return "8 heures";

    return "1 heure";
  }

  async function askHexAbility() {
    return new Promise(resolve => {
      new Dialog({
        title: "Hex / Maléfice - Ashara",
        content: `
          <form>
            <div class="form-group">
              <label>Caractéristique désavantagée pour les tests</label>
              <select id="ashara-hex-ability">
                <option value="str">Force</option>
                <option value="dex">Dextérité</option>
                <option value="con">Constitution</option>
                <option value="int">Intelligence</option>
                <option value="wis">Sagesse</option>
                <option value="cha">Charisme</option>
              </select>
            </div>
          </form>
        `,
        buttons: {
          ok: {
            label: "Appliquer Hex",
            callback: html => resolve(String(html.find("#ashara-hex-ability").val() || "str"))
          },
          cancel: {
            label: "Annuler",
            callback: () => resolve(null)
          }
        },
        default: "ok",
        close: () => resolve(null)
      }).render(true);
    });
  }

  function getAbilityLabel(ability) {
    const labels = {
      str: "Force",
      dex: "Dextérité",
      con: "Constitution",
      int: "Intelligence",
      wis: "Sagesse",
      cha: "Charisme"
    };

    return labels[ability] || ability || "caractéristique";
  }

  
  function findAsharaActorByIdentity(identity = {}) {
    if (!identity) return null;

    const actors = Array.from(game.actors || []);

    return actors.find(actor => {
      if (!actor) return false;
      if (identity.uuid && actor.uuid === identity.uuid) return true;
      if (identity.id && actor.id === identity.id) return true;
      if (identity.name && actor.name === identity.name) return true;
      return false;
    }) || null;
  }

  function getAsharaTargetIdentity(actor) {
    if (!actor) return {};

    return {
      uuid: actor.uuid || "",
      id: actor.id || "",
      name: actor.name || ""
    };
  }

  function asharaSameTargetIdentity(actor, identity = {}) {
    if (!actor || !identity) return false;

    if (identity.uuid && actor.uuid && identity.uuid === actor.uuid) return true;
    if (identity.id && actor.id && identity.id === actor.id) return true;
    if (identity.name && actor.name && identity.name === actor.name) return true;

    return false;
  }

  async function clearAsharaConcentration(caster, reason = "manual") {
    if (!caster) return false;

    await caster.unsetFlag(MODULE_ID, "concentration");
    await deleteAsharaEffect(caster, "concentration");

    log("Concentration Ashara retirée", {
      caster: caster.name,
      reason
    });

    return true;
  }

  async function applyAsharaConcentration(caster, data = {}) {
    if (!caster) return false;

    const {
      spellKey,
      spellName,
      targetActor,
      durationSeconds = 3600,
      icon = "icons/svg/upgrade.svg"
    } = data;

    await clearAsharaConcentration(caster, "new-concentration");

    const concentrationData = {
      spellKey,
      spellName,
      target: getAsharaTargetIdentity(targetActor),
      appliedAt: Date.now()
    };

    await caster.setFlag(MODULE_ID, "concentration", concentrationData);

    await createMarkerEffect(caster, {
      key: "concentration",
      name: `Concentrating: ${spellName} - Ashara`,
      icon,
      durationSeconds,
      data: {
        spell: "concentration",
        concentrationSpell: spellKey,
        spellName,
        target: concentrationData.target
      }
    });

    ChatMessage.create({
      content: `<b>Concentration - Ashara</b><br>${caster.name} se concentre sur <b>${spellName}</b>${targetActor ? ` contre ${targetActor.name}` : ""}.`
    });

    log("Concentration Ashara appliquée", {
      caster: caster.name,
      spellKey,
      spellName,
      target: targetActor?.name
    });

    return true;
  }

  async function removeAsharaMarkFromTarget(targetActor, spellKey, reason = "concentration-ended") {
    if (!targetActor) return false;

    await targetActor.unsetFlag(MODULE_ID, spellKey);
    await deleteAsharaEffect(targetActor, spellKey);

    log("Marque Ashara retirée via concentration", {
      target: targetActor.name,
      spellKey,
      reason
    });

    return true;
  }

  async function removeAsharaMarksFromConcentration(caster, reason = "concentration-ended") {
    if (!caster) return false;

    const concentration = caster.getFlag?.(MODULE_ID, "concentration");
    if (!concentration) return false;

    const spellKey = concentration.spellKey;
    const targetActor = findAsharaActorByIdentity(concentration.target);

    await caster.unsetFlag(MODULE_ID, "concentration");

    if (spellKey === "hex" && targetActor) {
      await removeAsharaMarkFromTarget(targetActor, "hex", reason);
    }

    if (spellKey === "huntersMark" && targetActor) {
      await removeAsharaMarkFromTarget(targetActor, "huntersMark", reason);
    }

    ChatMessage.create({
      content: `<b>Concentration - Ashara</b><br>La concentration de ${caster.name} prend fin${targetActor ? ` : la marque sur ${targetActor.name} est retirée.` : "."}`
    });

    log("Concentration Ashara terminée", {
      caster: caster.name,
      spellKey,
      target: targetActor?.name,
      reason
    });

    return true;
  }


async function removeHex(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "hex");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "hex");

    const caster = findAsharaActorByIdentity(data.caster);
    const concentration = caster?.getFlag?.(MODULE_ID, "concentration");

    if (
      caster &&
      concentration?.spellKey === "hex" &&
      asharaSameTargetIdentity(actor, concentration.target)
    ) {
      await clearAsharaConcentration(caster, `hex-removed-${reason}`);
    }

    log("Hex retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function removeHuntersMark(actor, reason = "manual") {
    const data = actor.getFlag(MODULE_ID, "huntersMark");
    if (!data) return false;

    await actor.unsetFlag(MODULE_ID, "huntersMark");

    const caster = findAsharaActorByIdentity(data.caster);
    const concentration = caster?.getFlag?.(MODULE_ID, "concentration");

    if (
      caster &&
      concentration?.spellKey === "huntersMark" &&
      asharaSameTargetIdentity(actor, concentration.target)
    ) {
      await clearAsharaConcentration(caster, `hunters-mark-removed-${reason}`);
    }

    log("Hunter's Mark retiré", {
      actor: actor.name,
      reason
    });

    return true;
  }

  async function applyHex(targetActor, item) {
    const key = "hex";
    const caster = item?.actor || item?.parent;
    const durationSeconds = 60 * 60;
    const ability = await askHexAbility();

    if (!ability) return false;

    await deleteAsharaEffect(targetActor, key);

    const casterIdentity = getAsharaActorIdentity(caster);

    await targetActor.setFlag(MODULE_ID, "hex", {
      caster: casterIdentity,
      ability,
      damageDie: "1d6",
      damageType: "necrotic",
      appliedAt: Date.now()
    });

    await createMarkerEffect(targetActor, {
      key,
      name: `Hex - Ashara (${getAbilityLabel(ability)})`,
      icon: "icons/magic/unholy/strike-hand-glow-pink.webp",
      durationSeconds,
      data: {
        spell: "hex",
        caster: casterIdentity,
        ability,
        damageDie: "1d6",
        damageType: "necrotic"
      }
    });

    await applyAsharaConcentration(caster, {
      spellKey: "hex",
      spellName: "Hex / Maléfice",
      targetActor,
      durationSeconds,
      icon: "icons/magic/unholy/strike-hand-glow-pink.webp"
    });

    log("Hex appliqué", {
      caster: caster?.name,
      target: targetActor.name,
      ability
    });

    return true;
  }

  async function applyHuntersMark(targetActor, item, spellLevel = 1) {
    const key = "huntersMark";
    const caster = item?.actor || item?.parent;
    const durationSeconds = getHuntersMarkDurationSeconds(spellLevel);
    const casterIdentity = getAsharaActorIdentity(caster);

    await deleteAsharaEffect(targetActor, key);

    await targetActor.setFlag(MODULE_ID, "huntersMark", {
      caster: casterIdentity,
      spellLevel,
      damageDie: "1d6",
      damageType: "force",
      appliedAt: Date.now()
    });

    await createMarkerEffect(targetActor, {
      key,
      name: `Hunter's Mark - Ashara Niv ${spellLevel}`,
      icon: "icons/skills/ranged/target-bullseye-arrow-blue.webp",
      durationSeconds,
      data: {
        spell: "huntersMark",
        caster: casterIdentity,
        spellLevel,
        damageDie: "1d6",
        damageType: "force"
      }
    });

    await applyAsharaConcentration(caster, {
      spellKey: "huntersMark",
      spellName: "Hunter's Mark / Marque du chasseur",
      targetActor,
      durationSeconds,
      icon: "icons/skills/ranged/target-bullseye-arrow-blue.webp"
    });

    log("Hunter's Mark appliqué", {
      caster: caster?.name,
      target: targetActor.name,
      spellLevel,
      durationSeconds
    });

    return true;
  }

  function getAsharaDamageTargets(workflow) {
    const result = [];

    function collect(set) {
      if (!set) return;

      for (const entry of Array.from(set)) {
        if (entry?.actor) result.push(entry);
        else if (entry?.document?.actor) result.push(entry.document);
        else if (entry?.token?.actor) result.push(entry.token);
      }
    }

    collect(workflow?.hitTargets);
    collect(workflow?.hitTargetsEC);
    collect(workflow?.targets);

    return [...new Set(result)];
  }

  function asharaIsAttackDamageWorkflow(workflow) {
    if (!workflow) return false;

    const item = workflow.item;
    const activity = workflow.activity;

    const actionType = asharaNormalizeText(
      item?.system?.actionType ||
      activity?.actionType ||
      activity?.attack?.type ||
      activity?.type ||
      ""
    );

    if (workflow.attackRoll) return true;
    if (workflow.isAttack) return true;

    if (["mwak", "rwak", "msak", "rsak"].includes(actionType)) return true;
    if (actionType.includes("attack")) return true;
    if (actionType.includes("attaque")) return true;

    return false;
  }

  function getAsharaMarkData(targetActor, key, attacker) {
    if (!targetActor || !attacker) return null;

    const flag = targetActor.getFlag?.(MODULE_ID, key);
    if (!flag) return null;

    const effect = targetActor.effects?.find(e => e.getFlag(MODULE_ID, "key") === key);
    if (!effect) return null;
    if (effect.disabled) return null;

    const caster = flag.caster || effect.getFlag?.(MODULE_ID, "caster") || {};

    if (!asharaSameActorIdentity(attacker, caster)) return null;

    return flag;
  }

  function asharaHexHuntersMarkDamageBonus(workflow) {
    try {
      if (!asharaIsAttackDamageWorkflow(workflow)) return null;

      const attacker = workflow.actor;
      if (!attacker) return null;

      const targets = getAsharaDamageTargets(workflow);
      if (!targets.length) return null;

      const damageParts = [];
      const flavorParts = [];

      for (const target of targets) {
        const targetActor = target?.actor;
        if (!targetActor) continue;

        const hex = getAsharaMarkData(targetActor, "hex", attacker);
        if (hex) {
          damageParts.push("1d6[necrotic]");
          flavorParts.push(`Hex sur ${targetActor.name}`);
        }

        const huntersMark = getAsharaMarkData(targetActor, "huntersMark", attacker);
        if (huntersMark) {
          damageParts.push("1d6[force]");
          flavorParts.push(`Hunter's Mark sur ${targetActor.name}`);
        }
      }

      if (!damageParts.length) return null;

      const damageRoll = damageParts.join(" + ");
      const flavor = `<b>Ashara Automations</b><br>${flavorParts.join("<br>")}`;

      log("Hex/Hunter's Mark : bonus de dégâts ajouté", {
        attacker: attacker.name,
        targets: targets.map(t => t.actor?.name),
        damageRoll,
        flavorParts
      });

      return {
        damageRoll,
        flavor
      };
    } catch (err) {
      error("Erreur Hex/Hunter's Mark DamageBonus :", err);
      return null;
    }
  }


  async function runAutomationForItem(item) {
    if (!item?.name) return false;

    const spellKey = getControlledSpellKey(item.name);
    if (!spellKey) return false;

    if (spellKey === "aid") {
      const targets = getTargetActorsForItem(item, { requireExplicitTarget: true });

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : cible au moins un token pour Aid.");
        return false;
      }

      const spellLevel = await askAidLevel();
      if (!spellLevel) return false;

      for (const actor of targets) {
        await applyAid(actor, spellLevel);
      }

      const bonus = 5 * (spellLevel - 1);

      ChatMessage.create({
        content: `<b>Aid / Aide - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent +${bonus} PV max et +${bonus} PV actuels pendant 8 heures.`
      });

      ui.notifications.info(`Ashara Automations : Aid appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "longstrider") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Longstrider.");
        return false;
      }

      for (const actor of targets) {
        await applyLongstrider(actor);
      }

      ChatMessage.create({
        content: `<b>Longstrider / Grandes foulées - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent +10 ft de vitesse de marche pendant 1 heure.`
      });

      ui.notifications.info(`Ashara Automations : Longstrider appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "darkvision") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Darkvision.");
        return false;
      }

      const range = await askDarkvisionRange();
      if (!range) return false;

      for (const actor of targets) {
        await applyDarkvision(actor, range);
      }

      ChatMessage.create({
        content: `<b>Darkvision / Vision dans le noir - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent Vision dans le noir ${range} ft pendant 8 heures.`
      });

      ui.notifications.info(`Ashara Automations : Darkvision appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "mageArmor") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Mage Armor.");
        return false;
      }

      for (const actor of targets) {
        await applyMageArmor(actor);
      }

      ChatMessage.create({
        content: `<b>Mage Armor / Armure du mage - Ashara</b><br>${targets.map(a => a.name).join(", ")} bénéficient de l’Armure du mage pendant 8 heures.`
      });

      ui.notifications.info(`Ashara Automations : Mage Armor appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "shieldOfFaith") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Shield of Faith.");
        return false;
      }

      for (const actor of targets) {
        await applyShieldOfFaith(actor);
      }

      ChatMessage.create({
        content: `<b>Shield of Faith / Bouclier de la foi - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent +2 AC pendant 10 minutes.`
      });

      ui.notifications.info(`Ashara Automations : Shield of Faith appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "falseLife") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour False Life.");
        return false;
      }

      const spellLevel = await askSpellLevel("False Life / Simulacre de vie - Ashara", 1, 9);
      if (!spellLevel) return false;

      const amount = await rollFalseLife(spellLevel);

      for (const actor of targets) {
        await applyFalseLife(actor, amount);
      }

      ChatMessage.create({
        content: `<b>False Life / Simulacre de vie - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent ${amount} PV temporaires pendant 1 heure.`
      });

      ui.notifications.info(`Ashara Automations : False Life appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "heroism") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Heroism.");
        return false;
      }

      const tempPerTurn = await askNumber("Heroism / Héroïsme - Ashara", "PV temporaires au début de chaque tour", 3);
      if (!tempPerTurn) return false;

      for (const actor of targets) {
        await applyHeroism(actor, tempPerTurn);
      }

      ChatMessage.create({
        content: `<b>Heroism / Héroïsme - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent ${tempPerTurn} PV temporaires au début de chaque tour pendant 1 minute.`
      });

      ui.notifications.info(`Ashara Automations : Heroism appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "armorOfAgathys") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Armor of Agathys.");
        return false;
      }

      const spellLevel = await askSpellLevel("Armor of Agathys / Armure d’Agathys - Ashara", 1, 9);
      if (!spellLevel) return false;

      const amount = 5 * spellLevel;

      for (const actor of targets) {
        await applyArmorOfAgathys(actor, spellLevel);
      }

      ChatMessage.create({
        content: `<b>Armor of Agathys / Armure d’Agathys - Ashara</b><br>${targets.map(a => a.name).join(", ")} gagnent ${amount} PV temporaires pendant 1 heure.<br><i>Les dégâts de froid de riposte restent à gérer manuellement pour l’instant.</i>`
      });

      ui.notifications.info(`Ashara Automations : Armor of Agathys appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "protectionEvilGood") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Protection from Evil and Good.");
        return false;
      }

      for (const actor of targets) {
        await applyProtectionEvilGood(actor);
      }

      ChatMessage.create({
        content: `<b>Protection from Evil and Good / Protection contre le mal et le bien - Ashara</b><br>${targets.map(a => a.name).join(", ")} reçoivent le marqueur de protection pendant 10 minutes.`
      });

      ui.notifications.info(`Ashara Automations : Protection from Evil and Good appliqué à ${targets.length} cible(s).`);
      return true;
    }


    if (spellKey === "expeditiousRetreat") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Expeditious Retreat.");
        return false;
      }

      for (const actor of targets) {
        await applyExpeditiousRetreat(actor);
      }

      ChatMessage.create({
        content: `<b>Expeditious Retreat / Repli expéditif - Ashara</b><br>${targets.map(a => a.name).join(", ")} peuvent utiliser Dash en action bonus pendant 10 minutes.`
      });

      ui.notifications.info(`Ashara Automations : Expeditious Retreat appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "jump") {
      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Jump.");
        return false;
      }

      for (const actor of targets) {
        await applyJump(actor);
      }

      ChatMessage.create({
        content: `<b>Jump / Saut - Ashara</b><br>${targets.map(a => a.name).join(", ")} multiplient leur distance de saut par 3 pendant 1 minute.`
      });

      ui.notifications.info(`Ashara Automations : Jump appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "hex") {
      const targets = getTargetActorsForItem(item, { requireExplicitTarget: true });

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : cible une créature pour Hex.");
        return false;
      }

      for (const actor of targets) {
        await applyHex(actor, item);
      }

      const flagText = targets.map(a => {
        const ability = a.getFlag(MODULE_ID, "hex")?.ability;
        return `${a.name} (${getAbilityLabel(ability)})`;
      }).join(", ");

      ChatMessage.create({
        content: `<b>Hex / Maléfice - Ashara</b><br>${flagText} reçoit Hex pendant 1 heure.<br>Quand le lanceur touche la cible avec une attaque : <b>+1d6 dégâts nécrotiques</b>.<br>Rappel : la cible a désavantage aux tests de la caractéristique choisie.`
      });

      ui.notifications.info(`Ashara Automations : Hex appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "huntersMark") {
      const targets = getTargetActorsForItem(item, { requireExplicitTarget: true });

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : cible une créature pour Hunter's Mark.");
        return false;
      }

      const spellLevel = await askSpellLevel("Hunter's Mark / Marque du chasseur - Ashara", 1, 9);
      if (!spellLevel) return false;

      for (const actor of targets) {
        await applyHuntersMark(actor, item, spellLevel);
      }

      ChatMessage.create({
        content: `<b>Hunter's Mark / Marque du chasseur - Ashara</b><br>${targets.map(a => a.name).join(", ")} reçoit Hunter's Mark pendant ${getHuntersMarkDurationLabel(spellLevel)}.<br>Quand le lanceur touche la cible avec une attaque : <b>+1d6 dégâts de force</b>.`
      });

      ui.notifications.info(`Ashara Automations : Hunter's Mark appliqué à ${targets.length} cible(s).`);
      return true;
    }

    if (spellKey === "sanctuary") {
      log("Sanctuary détecté via runAutomationForItem", {
        item: item.name,
        uuid: item.uuid,
        actor: item.actor?.name
      });

      const targets = getTargetActorsForItem(item);

      if (!targets.length) {
        ui.notifications.warn("Ashara Automations : aucune cible pour Sanctuary.");
        return false;
      }

      for (const actor of targets) {
        await applySanctuary(actor, item);
      }

      ChatMessage.create({
        content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>${targets.map(a => a.name).join(", ")} reçoivent Sanctuaire pendant 1 minute.`
      });

      ui.notifications.info(`Ashara Automations : Sanctuary appliqué à ${targets.length} cible(s).`);
      return true;
    }

    return false;
  }

  function isLegacyAidEffect(effect) {
    const name = String(effect.name || effect.label || "");
    return /^Level\s+\d+\s*:\s*\+\d+\s*Max HP/i.test(name);
  }

  function isEffectFromControlledItem(effect) {
    const origin = String(effect.origin || "");

    if (!origin) return false;

    for (const uuid of controlledItemUuids) {
      if (origin === uuid || origin.startsWith(`${uuid}.`)) {
        return true;
      }
    }

    return false;
  }


  const recentlyHandledItems = new Map();

  function markHandled(item) {
    if (!item?.uuid) return;
    recentlyHandledItems.set(item.uuid, Date.now());
  }

  function wasRecentlyHandled(item) {
    if (!item?.uuid) return false;

    const last = recentlyHandledItems.get(item.uuid);
    if (!last) return false;

    return Date.now() - last < 2500;
  }


  const asharaMarkDamageHandled = new Set();

  function getAsharaWorkflowId(workflow) {
    return workflow?.uuid || workflow?.id || workflow?._id || workflow?.itemCardId || `${Date.now()}-${Math.random()}`;
  }

  function getAsharaTargetToken(target) {
    if (!target) return null;

    if (target.object?.actor) return target.object;
    if (target.token?.actor) return target.token;
    if (target.document?.object?.actor) return target.document.object;
    if (target.actor && target.center) return target;

    const actor = target.actor || target.document?.actor;
    if (!actor) return null;

    return canvas.tokens?.placeables?.find(token => {
      if (!token?.actor) return false;
      if (token.actor === actor) return true;
      if (token.actor.uuid && actor.uuid && token.actor.uuid === actor.uuid) return true;
      if (token.actor.id && actor.id && token.actor.id === actor.id) return true;
      return token.actor.name === actor.name;
    }) || null;
  }

  async function applyAsharaBonusDamage({ workflow, target, damageFormula, damageType, label }) {
    const attacker = workflow?.actor;
    const attackerToken = workflow?.token || canvas.tokens?.controlled?.[0] || null;
    const targetToken = getAsharaTargetToken(target);
    const targetActor = target?.actor || target?.document?.actor || targetToken?.actor;

    if (!attacker || !targetActor) return false;

    let roll;

    try {
      roll = await new Roll(damageFormula).evaluate();
    } catch (err) {
      error(`${label} : erreur sur la formule de dégâts, fallback 1d6.`, {
        damageFormula,
        damageType,
        err
      });

      roll = await new Roll("1d6").evaluate();
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      flavor: `<b>${label} - Ashara</b><br>${attacker.name} inflige <b>${roll.total}</b> dégâts de ${damageType} supplémentaires à ${targetActor.name}.`
    });

    try {
      if (globalThis.MidiQOL?.DamageOnlyWorkflow && targetToken) {
        new MidiQOL.DamageOnlyWorkflow(
          attacker,
          attackerToken,
          roll.total,
          damageType,
          [targetToken],
          roll,
          {
            flavor: `${label} - Ashara`,
            itemCardUuid: workflow?.itemCardUuid,
            asharaBonusDamage: true,
            workflowOptions: {
              asharaBonusDamage: true
            }
          }
        );

        log(`${label} : dégâts appliqués via DamageOnlyWorkflow`, {
          attacker: attacker.name,
          target: targetActor.name,
          total: roll.total,
          damageType
        });

        return true;
      }
    } catch (err) {
      error(`${label} : DamageOnlyWorkflow indisponible ou en erreur.`, err);
    }

    ChatMessage.create({
      content: `<b>${label} - Ashara</b><br><b>À appliquer manuellement si Midi-QOL ne l'a pas fait :</b> ${roll.total} dégâts de ${damageType} à ${targetActor.name}.`
    });

    return true;
  }

  async function handleHexHuntersMarkExtraDamage(workflow) {
    try {
      const itemName = String(workflow?.item?.name || "");

      // Très important :
      // DamageOnlyWorkflow crée un nouveau workflow Midi-QOL.
      // Sans cette sécurité, nos dégâts Hunter's Mark / Hex déclenchent eux-mêmes Hunter's Mark / Hex en boucle.
      if (
        workflow?.constructor?.name === "DamageOnlyWorkflow" ||
        workflow?.isDamageOnlyWorkflow ||
        itemName.includes("Hunter's Mark / Marque du chasseur - Ashara") ||
        itemName.includes("Hex / Maléfice - Ashara") ||
        itemName.includes("Hex / Malefice - Ashara") ||
        workflow?.options?.asharaBonusDamage === true ||
        workflow?.workflowOptions?.asharaBonusDamage === true
      ) {
        log("Hex/Hunter's Mark : workflow de dégâts bonus ignoré pour éviter une boucle", {
          item: itemName,
          workflowClass: workflow?.constructor?.name
        });
        return false;
      }

      if (!asharaIsAttackDamageWorkflow(workflow)) return false;

      const attacker = workflow?.actor;
      if (!attacker) return false;

      const workflowId = getAsharaWorkflowId(workflow);
      const targets = getAsharaDamageTargets(workflow);

      if (!targets.length) {
        log("Hex/Hunter's Mark : aucun hit target détecté au RollComplete", {
          attacker: attacker.name,
          item: workflow?.item?.name
        });
        return false;
      }

      let applied = false;

      for (const target of targets) {
        const targetActor = target?.actor || target?.document?.actor;
        if (!targetActor) continue;

        const targetKey =
          targetActor.uuid ||
          targetActor.id ||
          targetActor.name ||
          "target";

        const hex = getAsharaMarkData(targetActor, "hex", attacker);

        if (hex) {
          const key = `${workflowId}-${targetKey}-hex`;

          if (!asharaMarkDamageHandled.has(key)) {
            asharaMarkDamageHandled.add(key);
            setTimeout(() => asharaMarkDamageHandled.delete(key), 60000);

            await applyAsharaBonusDamage({
              workflow,
              target,
              damageFormula: "1d6[necrotic]",
              damageType: "necrotic",
              label: "Hex / Maléfice"
            });

            applied = true;
          }
        }

        const huntersMark = getAsharaMarkData(targetActor, "huntersMark", attacker);

        if (huntersMark) {
          const key = `${workflowId}-${targetKey}-huntersMark`;

          if (!asharaMarkDamageHandled.has(key)) {
            asharaMarkDamageHandled.add(key);
            setTimeout(() => asharaMarkDamageHandled.delete(key), 60000);

            await applyAsharaBonusDamage({
              workflow,
              target,
              damageFormula: "1d6[force]",
              damageType: "force",
              label: "Hunter's Mark / Marque du chasseur"
            });

            applied = true;
          }
        }
      }

      if (applied) {
        log("Hex/Hunter's Mark : dégâts supplémentaires traités au RollComplete", {
          attacker: attacker.name,
          targets: targets.map(t => t.actor?.name || t.document?.actor?.name || t.name)
        });
      }

      return applied;
    } catch (err) {
      error("Erreur Hex/Hunter's Mark RollComplete :", err);
      return false;
    }
  }



  function getHexAbilityForActor(actor) {
    if (!actor) return null;

    const flag = actor.getFlag?.(MODULE_ID, "hex");
    if (!flag) return null;

    const effect = actor.effects?.find(e => e.getFlag(MODULE_ID, "key") === "hex");
    if (!effect) return null;
    if (effect.disabled) return null;

    const ability = String(flag.ability || "").toLowerCase();

    if (!["str", "dex", "con", "int", "wis", "cha"].includes(ability)) return null;

    return ability;
  }

  function forceDisadvantageOnRollOptions(options = {}) {
    options.disadvantage = true;
    options.advantage = false;

    options.fastForward = options.fastForward ?? false;

    if (options.configureDialogOptions) {
      options.configureDialogOptions.disadvantage = true;
      options.configureDialogOptions.advantage = false;
    }

    if (options.dialogOptions) {
      options.dialogOptions.disadvantage = true;
      options.dialogOptions.advantage = false;
    }

    return options;
  }

  function getSkillAbility(actor, skillId) {
    const skill = actor?.system?.skills?.[skillId];
    const ability =
      skill?.ability ||
      skill?.defaultAbility ||
      skill?.mod?.ability ||
      CONFIG?.DND5E?.skills?.[skillId]?.ability ||
      CONFIG?.DND5E?.skills?.[skillId]?.defaultAbility ||
      null;

    return ability ? String(ability).toLowerCase() : null;
  }

  function installHexAbilityCheckDisadvantage() {
    const ActorClass = CONFIG?.Actor?.documentClass;
    if (!ActorClass?.prototype) {
      log("Hex : Actor documentClass introuvable, désavantage non installé.");
      return;
    }

    if (ActorClass.prototype.__asharaHexAbilityCheckDisadvantageInstalled) return;
    ActorClass.prototype.__asharaHexAbilityCheckDisadvantageInstalled = true;

    const originalRollAbilityTest = ActorClass.prototype.rollAbilityTest;
    const originalRollSkill = ActorClass.prototype.rollSkill;

    if (typeof originalRollAbilityTest === "function") {
      ActorClass.prototype.rollAbilityTest = async function(abilityId, options = {}) {
        const hexAbility = getHexAbilityForActor(this);
        const rolledAbility = String(abilityId || "").toLowerCase();

        if (hexAbility && rolledAbility === hexAbility) {
          forceDisadvantageOnRollOptions(options);

          ChatMessage.create({
            content: `<b>Hex / Maléfice - Ashara</b><br>${this.name} a désavantage à ce test de ${getAbilityLabel(hexAbility)}.`
          });

          log("Hex : désavantage appliqué à un test de caractéristique", {
            actor: this.name,
            ability: hexAbility
          });
        }

        return originalRollAbilityTest.call(this, abilityId, options);
      };
    }

    if (typeof originalRollSkill === "function") {
      ActorClass.prototype.rollSkill = async function(skillId, options = {}) {
        const hexAbility = getHexAbilityForActor(this);
        const skillAbility = getSkillAbility(this, skillId);

        if (hexAbility && skillAbility === hexAbility) {
          forceDisadvantageOnRollOptions(options);

          const skillLabel =
            CONFIG?.DND5E?.skills?.[skillId]?.label ||
            CONFIG?.DND5E?.skills?.[skillId]?.name ||
            skillId;

          ChatMessage.create({
            content: `<b>Hex / Maléfice - Ashara</b><br>${this.name} a désavantage au test de compétence <b>${skillLabel}</b>, car il utilise ${getAbilityLabel(hexAbility)}.`
          });

          log("Hex : désavantage appliqué à un test de compétence", {
            actor: this.name,
            skill: skillId,
            ability: hexAbility
          });
        }

        return originalRollSkill.call(this, skillId, options);
      };
    }

    log("Hex : désavantage automatique aux tests de caractéristique installé.");
  }


  async function tryRunAutomationFromHook(item, source = "unknown") {
    if (!item?.name) return false;
    if (!isControlledSpellName(item.name)) return false;
    if (wasRecentlyHandled(item)) return false;

    markHandled(item);

    log("Sort contrôlé détecté via hook :", {
      source,
      name: item.name,
      uuid: item.uuid
    });

    await runAutomationForItem(item);

    return true;
  }

  Hooks.on("preCreateActiveEffect", effect => {
    const isAsharaEffect = !!effect.getFlag?.(MODULE_ID, "key");
    if (isAsharaEffect) return true;

    if (isLegacyAidEffect(effect)) {
      log("Effet Aid legacy bloqué :", effect.name || effect.label);
      return false;
    }

    if (isEffectFromControlledItem(effect)) {
      log("Effet DAE bloqué pour un sort contrôlé par Ashara :", {
        effect: effect.name || effect.label,
        origin: effect.origin
      });
      return false;
    }

    return true;
  });

  Hooks.on("deleteActiveEffect", async effect => {
    const key = effect.getFlag(MODULE_ID, "key");
    if (!key) return;

    const actor = effect.parent;
    if (!actor) return;

    if (key === "aid") await removeAid(actor, "effect-delete");
    if (key === "longstrider") await removeLongstrider(actor, "effect-delete");
    if (key === "darkvision") await removeDarkvision(actor, "effect-delete");
    if (key === "mageArmor") await removeMageArmor(actor, "effect-delete");
    if (key === "shieldOfFaith") await removeShieldOfFaith(actor, "effect-delete");
    if (key === "falseLife") await removeFalseLife(actor, "effect-delete");
    if (key === "heroism") await removeHeroism(actor, "effect-delete");
    if (key === "armorOfAgathys") await removeArmorOfAgathys(actor, "effect-delete");
    if (key === "protectionEvilGood") await removeProtectionEvilGood(actor, "effect-delete");
    if (key === "expeditiousRetreat") await removeExpeditiousRetreat(actor, "effect-delete");
    if (key === "jump") await removeJump(actor, "effect-delete");
    if (key === "hex") await removeHex(actor, "effect-delete");
    if (key === "huntersMark") await removeHuntersMark(actor, "effect-delete");
    if (key === "concentration") await removeAsharaMarksFromConcentration(actor, "effect-delete");
    if (key === "sanctuary") await removeSanctuary(actor, "effect-delete");
  });

  Hooks.on("updateActiveEffect", async (effect, changes) => {
    const key = effect.getFlag(MODULE_ID, "key");
    if (!key) return;
    if (changes?.disabled !== true) return;

    const actor = effect.parent;
    if (!actor) return;

    if (key === "aid") await removeAid(actor, "effect-disabled");
    if (key === "longstrider") await removeLongstrider(actor, "effect-disabled");
    if (key === "darkvision") await removeDarkvision(actor, "effect-disabled");
    if (key === "mageArmor") await removeMageArmor(actor, "effect-disabled");
    if (key === "shieldOfFaith") await removeShieldOfFaith(actor, "effect-disabled");
    if (key === "falseLife") await removeFalseLife(actor, "effect-disabled");
    if (key === "heroism") await removeHeroism(actor, "effect-disabled");
    if (key === "armorOfAgathys") await removeArmorOfAgathys(actor, "effect-disabled");
    if (key === "protectionEvilGood") await removeProtectionEvilGood(actor, "effect-disabled");
    if (key === "expeditiousRetreat") await removeExpeditiousRetreat(actor, "effect-disabled");
    if (key === "jump") await removeJump(actor, "effect-disabled");
    if (key === "hex") await removeHex(actor, "effect-disabled");
    if (key === "huntersMark") await removeHuntersMark(actor, "effect-disabled");
    if (key === "concentration") await removeAsharaMarksFromConcentration(actor, "effect-disabled");
    if (key === "sanctuary") await removeSanctuary(actor, "effect-disabled");
  });


  Hooks.on("updateCombat", async combat => {
    const combatant = combat?.combatant;
    const actor = combatant?.actor;
    if (!actor) return;

    try {
      await refreshHeroism(actor);
    } catch (err) {
      error("Erreur refresh Heroism début de tour :", err);
    }
  });


  Hooks.on("createItem", item => {
    if (isControlledSpellName(item.name)) refreshControlledItemUuids();
  });

  Hooks.on("updateItem", item => {
    if (isControlledSpellName(item.name)) refreshControlledItemUuids();
  });

  Hooks.on("deleteItem", item => {
    if (isControlledSpellName(item.name)) refreshControlledItemUuids();
  });


  function asharaNormalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function asharaHasProtectionEvilGood(actor) {
    if (!actor) return false;

    const flag = actor.getFlag(MODULE_ID, "protectionEvilGood");
    if (!flag) return false;

    const effect = actor.effects?.find(e => e.getFlag(MODULE_ID, "key") === "protectionEvilGood");
    if (!effect) return false;
    if (effect.disabled) return false;

    return true;
  }

  function asharaGetActorTypeText(actor) {
    const details = actor?.system?.details ?? {};
    const traits = actor?.system?.traits ?? {};
    const values = [];

    function collect(v) {
      if (!v) return;

      if (typeof v === "string") {
        values.push(v);
        return;
      }

      if (Array.isArray(v)) {
        for (const x of v) collect(x);
        return;
      }

      if (v instanceof Set) {
        for (const x of v) collect(x);
        return;
      }

      if (typeof v === "object") {
        collect(v.value);
        collect(v.custom);
        collect(v.type);
        collect(v.subtype);
        collect(v.label);
      }
    }

    collect(details.type);
    collect(details.race);
    collect(details.species);
    collect(details.cr);
    collect(traits);

    return asharaNormalizeText(values.join(" "));
  }

  function asharaIsProtectionCreature(actor) {
    const text = asharaGetActorTypeText(actor);

    const validTypes = [
      "aberration",
      "celestial",
      "celeste",
      "elemental",
      "elementaire",
      "fey",
      "fee",
      "fiend",
      "fielon",
      "undead",
      "mort-vivant",
      "mort vivant"
    ];

    return validTypes.some(t => text.includes(t));
  }

  function asharaGetWorkflowTargets(workflow) {
    const result = [];

    function collect(set) {
      if (!set) return;

      for (const entry of Array.from(set)) {
        if (entry?.actor) result.push(entry);
        else if (entry?.document?.actor) result.push(entry.document);
        else if (entry?.token?.actor) result.push(entry.token);
      }
    }

    collect(workflow?.targets);
    collect(workflow?.hitTargets);
    collect(workflow?.hitTargetsEC);

    // Fallback très important : parfois Midi ne remplit pas encore workflow.targets à ce stade.
    collect(game.user?.targets);

    return [...new Set(result)];
  }

  function asharaIsAttackWorkflow(workflow) {
    if (!workflow) return false;

    const item = workflow.item;
    const activity = workflow.activity;

    const actionType = asharaNormalizeText(
      item?.system?.actionType ||
      activity?.actionType ||
      activity?.attack?.type ||
      activity?.type ||
      ""
    );

    if (workflow.attackRoll) return true;
    if (workflow.isAttack) return true;

    if (["mwak", "rwak", "msak", "rsak"].includes(actionType)) return true;
    if (actionType.includes("attack")) return true;
    if (actionType.includes("attaque")) return true;

    return false;
  }

  function asharaForceDisadvantage(workflow, source = "unknown") {
    if (!workflow) return false;

    const attacker = workflow.actor;
    if (!attacker) return true;

    const targets = asharaGetWorkflowTargets(workflow);
    const protectedTargets = targets.filter(t => asharaHasProtectionEvilGood(t.actor));

    if (!protectedTargets.length) {
      log("Protection Evil/Good ignorée : aucune cible protégée détectée", {
        source,
        attacker: attacker.name,
        targets: targets.map(t => t.name)
      });
      return false;
    }

    const attackerIsValidType = asharaIsProtectionCreature(attacker);

    if (!attackerIsValidType) {
      log("Protection Evil/Good ignorée : type attaquant non reconnu", {
        source,
        attacker: attacker.name,
        detectedTypeText: asharaGetActorTypeText(attacker)
      });
      return false;
    }

    if (!asharaIsAttackWorkflow(workflow)) {
      log("Protection Evil/Good ignorée : workflow pas reconnu comme attaque", {
        source,
        attacker: attacker.name,
        item: workflow.item?.name,
        actionType: workflow.item?.system?.actionType
      });
      return false;
    }

    workflow.disadvantage = true;
    workflow.advantage = false;

    workflow.options = workflow.options || {};
    workflow.options.disadvantage = true;
    workflow.options.advantage = false;

    workflow.workflowOptions = workflow.workflowOptions || {};
    workflow.workflowOptions.disadvantage = true;
    workflow.workflowOptions.advantage = false;

    workflow.rollOptions = workflow.rollOptions || {};
    workflow.rollOptions.disadvantage = true;
    workflow.rollOptions.advantage = false;

    if (workflow.attackAdvAttribution?.add) {
      workflow.attackAdvAttribution.add("Protection from Evil and Good - Ashara");
    }

    log("Protection Evil/Good : désavantage FORCÉ", {
      source,
      attacker: attacker.name,
      protectedTargets: protectedTargets.map(t => t.name),
      detectedTypeText: asharaGetActorTypeText(attacker)
    });

    ChatMessage.create({
      content: `<b>Protection from Evil and Good / Protection contre le mal et le bien - Ashara</b><br>${attacker.name} attaque ${protectedTargets.map(t => t.name).join(", ")} avec <b>désavantage</b>.`
    });

    return true;
  }


  async function applySanctuaryToSelected() {
    const actor = canvas.tokens.controlled[0]?.actor;

    if (!actor) {
      ui.notifications.error("Ashara Automations : sélectionne le token qui doit recevoir Sanctuary.");
      return false;
    }

    await applySanctuary(actor, null);

    ChatMessage.create({
      content: `<b>Sanctuary / Sanctuaire - Ashara</b><br>Sanctuary appliqué manuellement à ${actor.name}.`
    });

    ui.notifications.info(`Ashara Automations : Sanctuary appliqué à ${actor.name}.`);
    return true;
  }

  Hooks.once("ready", () => {
    refreshControlledItemUuids();

    window.ASHARA_AUTOMATIONS = {
      version: "0.4.8",
      applyAid,
      removeAid,
      applyLongstrider,
      removeLongstrider,
      applyDarkvision,
      removeDarkvision,
      applyMageArmor,
      removeMageArmor,
      applyShieldOfFaith,
      removeShieldOfFaith,
      applyFalseLife,
      removeFalseLife,
      applyHeroism,
      removeHeroism,
      applyArmorOfAgathys,
      removeArmorOfAgathys,
      applyProtectionEvilGood,
      applySanctuary,
      applySanctuaryToSelected,
      applyHex,
      removeHex,
      applyHuntersMark,
      removeHuntersMark,
      removeProtectionEvilGood,
      runAutomationForItem,
      refreshControlledItemUuids
    };

    const ItemClass = CONFIG.Item.documentClass;

    if (!ItemClass.prototype._asharaAutomationsWrapped) {
      const originalUse = ItemClass.prototype.use;

      ItemClass.prototype.use = async function(...args) {
        const controlled = isControlledSpellName(this.name);

        try {
          if (controlled) {
            log("Sort contrôlé lancé depuis fiche :", this.name);
            await runAutomationForItem(this);
          }
        } catch (err) {
          error("Erreur automation avant lancement du sort :", err);
          ui.notifications.error(`Ashara Automations : erreur sur ${this.name}. Voir console.`);
        }

        const result = await originalUse.apply(this, args);

        return result;
      };

      ItemClass.prototype._asharaAutomationsWrapped = true;
      log("Interception des sorts depuis les fiches activée.");
    }

    Hooks.on("dnd5e.useItem", async (...args) => {
      const item = args.find(a => a?.documentName === "Item" || a?.constructor?.documentName === "Item" || a?.type);
      if (!item) return;
      try {
        await tryRunAutomationFromHook(item, "dnd5e.useItem");
      } catch (err) {
        error("Erreur hook dnd5e.useItem :", err);
      }
    });

    Hooks.on("midi-qol.RollComplete", async workflow => {
      const item = workflow?.item;
      if (!item) return;
      try {
        await tryRunAutomationFromHook(item, "midi-qol.RollComplete");
        await handleArmorOfAgathysRetaliation(workflow);
        await handleHexHuntersMarkExtraDamage(workflow);
      } catch (err) {
        error("Erreur hook midi-qol.RollComplete :", err);
      }
    });

    Hooks.on("midi-qol.preItemRoll", async workflow => {
      const item = workflow?.item;
      if (!item) return;
      try {
        await tryRunAutomationFromHook(item, "midi-qol.preItemRoll");
      } catch (err) {
        error("Erreur hook midi-qol.preItemRoll :", err);
      }
    });


    Hooks.on("midi-qol.preAttackRoll", workflow => {
      try {
        asharaForceDisadvantage(workflow, "midi-qol.preAttackRoll");
      } catch (err) {
        error("Erreur Protection Evil/Good preAttackRoll :", err);
      }
    });

    Hooks.on("midi-qol.preItemRoll", workflow => {
      try {
        asharaForceDisadvantage(workflow, "midi-qol.preItemRoll");
      } catch (err) {
        error("Erreur Protection Evil/Good preItemRoll :", err);
      }
    });

    Hooks.on("midi-qol.preCheckHits", workflow => {
      try {
        asharaForceDisadvantage(workflow, "midi-qol.preCheckHits");
      } catch (err) {
        error("Erreur Protection Evil/Good preCheckHits :", err);
      }
    });

    log("Protection Evil/Good : hooks de désavantage activés.");


    Hooks.on("midi-qol.preAttackRoll", async workflow => {
      try {
        const result = await sanctuaryReminder(workflow, "midi-qol.preAttackRoll");
        if (result === false) return false;
        return true;
      } catch (err) {
        error("Erreur Sanctuary preAttackRoll :", err);
        return true;
      }
    });

    Hooks.on("midi-qol.preItemRoll", async workflow => {
      try {
        const result = await sanctuaryReminder(workflow, "midi-qol.preItemRoll");
        if (result === false) return false;
        return true;
      } catch (err) {
        error("Erreur Sanctuary preItemRoll :", err);
        return true;
      }
    });

    log("Sanctuary : sauvegarde automatique activée.");

    log("Hex/Hunter's Mark : dégâts supplémentaires RollComplete activés.");

    installHexAbilityCheckDisadvantage();



    log("Hooks D&D5e/Midi activés pour les sorts contrôlés.");
    log("Module prêt.", window.ASHARA_AUTOMATIONS);
  });
})();
