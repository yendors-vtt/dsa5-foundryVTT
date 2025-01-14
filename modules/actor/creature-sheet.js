import ActorSheetDsa5 from "./actor-sheet.js";
import TraitRulesDSA5 from "../system/trait-rules-dsa5.js"
import APTracker from "../system/ap-tracker.js";
const { mergeObject, getProperty } = foundry.utils

export default class ActorSheetdsa5Creature extends ActorSheetDsa5 {
    static get defaultOptions() {
        const options = super.defaultOptions;
        mergeObject(options, { classes: options.classes.concat(["dsa5", "actor", "creature-sheet"]) });
        return options;
    }

    get template() {
        if (this.showLimited()) return "systems/dsa5/templates/actors/creature-limited.html";

        return "systems/dsa5/templates/actors/creature-sheet.html";
    }

    async getData(options) {
        const data = await super.getData(options);
        data.enrichedDescription = await TextEditor.enrichHTML(getProperty(this.actor.system, "description.value"), {secrets: this.object.isOwner, async: true})
        data.enrichedBehaviour = await TextEditor.enrichHTML(getProperty(this.actor.system, "behaviour.value"), {secrets: this.object.isOwner, async: true})
        data.enrichedFlight = await TextEditor.enrichHTML(getProperty(this.actor.system, "flight.value"), {secrets: this.object.isOwner, async: true})
        data.enrichedSpecialrules = await TextEditor.enrichHTML(getProperty(this.actor.system, "specialRules.value"), {secrets: this.object.isOwner, async: true})
        return data;
    }

    async _cleverDeleteItem(itemId) {
        let item = this.actor.items.find(x => x.id == itemId)
        switch (item.type) {
            case "trait":
                const xpCost = item.system.APValue.value * -1
                await this._updateAPs(xpCost, {}, { render: false })
                await APTracker.track(this.actor, { type: "item", item, state: -1 }, xpCost)
                break;
        }
        await super._cleverDeleteItem(itemId)
    }

    async _addTrait(item) {
        let res = this.actor.items.find(i => i.type == "trait" && i.name == item.name);
        if (!res) {
            await this._updateAPs(item.system.APValue.value, {}, { render: false })
            await TraitRulesDSA5.traitAdded(this.actor, item)
            const createdItem = (await this.actor.createEmbeddedDocuments("Item", [item]))[0]
            await APTracker.track(this.actor, { type: "item", item: createdItem, state: 1 }, item.system.APValue.value)
        }
    }

    async _onDropItemCreate(itemData) {
        if(itemData.type == "trait") return this._addTrait(itemData)

        return super._onDropItemCreate(itemData)
    }
}