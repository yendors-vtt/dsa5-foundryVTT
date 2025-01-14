import DSA5_Utility from "./utility-dsa5.js"
import ADVANCEDFILTERS from "./itemlibrary_advanced_filters.js"
import { clickableAbility, tabSlider } from "./view_helper.js"
import DSA5 from "./config-dsa5.js"
const { getProperty, duplicate, debounce, mergeObject } = foundry.utils
//TODO merge existing index with advanced details
//TODO create index with getIndex(fields)
//TODO check if we can use the uuid right from the start

class SearchDocument {
    constructor(item, pack = {}) {
        let filterType = item.documentName || item.type
        switch (item.documentName) {
            case 'Actor':
            case 'Item':
                filterType = item.type
                break
        }
        let data = ""
        if (game.settings.get("dsa5", "indexDescription")) {
            switch (filterType) {
                case "creature":
                case "npc":
                case "character":
                    data = getProperty(item, "system.description.value")
                    break
                case 'JournalEntry':
                    data = getProperty(item, "system.content")
                    break
                default:
                    data = getProperty(item, "description.value")
            }
        }

        this.document = {
            name: item.name,
            filterType,
            data: $("<div>").html(data).text(),
            id: item.id || item._id,
            visible: item.visible ? item.visible : true,
            compendium: item.compendium ? item.compendium.metadata.packageName : (pack.packageName || ""),
            pack: item.pack || (pack.packageName ? pack.id : undefined),
            img: item.img,
            price: item.system?.price?.value
        }
    }

    get uuid() {
        if (this.document.compendium) {
            return `Compendium.${this.document.pack}.${this.document.id}`
        } else {
            switch (this.itemType) {
                case "character":
                case "creature":
                case "npc":
                    return `Actor.${this.id}`
                case "JournalEntry":
                    return `JournalEntry.${this.id}`
                default:
                    return `Item.${this.id}`
            }
        }
    }

    get name() {
        return this.document.name
    }
    get data() {
        return this.document.data
    }
    get id() {
        return this.document.id
    }
    get itemType() {
        return this.document.filterType
    }

    get hasPrice() {
        return DSA5.equipmentCategories.has(this.document.filterType)
    }

    async getItem() {
        return await fromUuid(this.uuid)
    }

    hasPermission() {
        return this.document.visible
    }
    async render() {
        (await this.getItem()).sheet.render(true)
    }
    get compendium() {
        return this.document.compendium
    }
    get img() {
        if (this.itemType == 'JournalEntry') return "systems/dsa5/icons/categories/DSA-Auge.webp"

        return this.document.img
    }
}

class AdvancedSearchDocument extends SearchDocument {
    constructor(item, subcategory) {
        super(item)

        const attrs = ADVANCEDFILTERS[subcategory] || []
        for (let attr of attrs) {
            this[attr.attr] = attr.attr.split(".").reduce((prev, cure) => {
                return prev[cure] === undefined ? {} : prev[cure]
            }, item.system)
        }
    }
}

export default class DSA5ItemLibrary extends Application {
    constructor(app) {
        super(app)
        this.advancedFiltering = false
        this.journalBuild = false
        this.journalWorldBuild = false
        this.equipmentBuild = false
        this.equipmentWorldBuild
        this.zooBuild = false
        this.zooWorldBuild = false
        this.currentDetailFilter = {
            equipment: [],
            character: [],
            spell: [],
            journal: [],
            zoo: []
        }
        this.journalIndex = new FlexSearch({
            encode: "simple",
            tokenize: "reverse",
            cache: true,
            doc: {
                id: "id",
                field: [
                    "name",
                    "data"
                ],
            }
        });
        this.equipmentIndex = new FlexSearch({
            encode: "simple",
            tokenize: "reverse",
            cache: true,
            doc: {
                id: "id",
                field: [
                    "name",
                    "data",
                    "itemType"
                ],
                tag: ["itemType"]
            }
        });
        this.zooIndex = new FlexSearch({
            encode: "simple",
            tokenize: "reverse",
            cache: true,
            doc: {
                id: "id",
                field: [
                    "name",
                    "data",
                    "itemType"
                ],
                tag: ["itemType"]
            }
        });

        this.detailFilter = {}

        this.pages = {
            equipment: {},
            character: {},
            spell: {},
            journal: {},
            zoo: {}
        }

        this.filters = {
            equipment: {
                categories: {
                    armor: false,
                    ammunition: false,
                    equipment: false,
                    meleeweapon: false,
                    rangeweapon: false,
                    poison: false,
                    disease: false,
                    consumable: false,
                    plant: false,
                    book: false
                },
                filterBy: {
                    search: ""
                }
            },
            character: {
                categories: {
                    career: false,
                    advantage: false,
                    combatskill: false,
                    culture: false,
                    disadvantage: false,
                    trait: false,
                    skill: false,
                    specialability: false,
                    species: false,
                    application: false,
                    demonmark: false,
                    patron: false,
                    essence: false,
                    imprint: false
                },
                filterBy: {
                    search: ""
                }
            },
            spell: {
                categories: {
                    blessing: false,
                    ceremony: false,
                    liturgy: false,
                    magictrick: false,
                    ritual: false,
                    spell: false,
                    spellextension: false,
                    magicalsign: false
                },
                filterBy: {
                    search: ""
                }
            },
            journal: {
                categories: {},
                filterBy: {
                    search: ""
                }
            },
            zoo: {
                categories: {
                    npc: false,
                    character: false,
                    creature: false
                },
                filterBy: {
                    search: ""
                }
            },

        }

    }

    async getData(options) {
        const data = await super.getData(options);
        data.categories = this.translateFilters()
        data.isGM = game.user.isGM
        data.advancedMode = this.advancedFiltering ? "on" : ""
        data.worldIndexed = game.settings.get("dsa5", "indexWorldItems") ? "on" : ""
        data.fullTextEnabled = game.settings.get("dsa5", "indexDescription") ? "on" : ""
        data.filterDuplicateItems = game.settings.get("dsa5", "filterDuplicateItems") ? "on" : ""
        data.browseEnabled = this.browseEnabled ? "on" : ""
        if (this.advancedFiltering) {
            data.advancedFilter = await this.buildDetailFilter("tbd", this.subcategory)
        }
        return data
    }

    translateFilters() {
        return {
            equipment: this.buildFilter(this.filters.equipment),
            character: this.buildFilter(this.filters.character),
            spell: this.buildFilter(this.filters.spell),
            zoo: this.buildFilter(this.filters.zoo, "Actor"),
            journal: this.buildFilter(this.filters.journal)
        }
    }

    purgeAdvancedFilters() {
        for (let key in this.filters) {
            for (let subkey in this.filters[key]["categories"]) {
                this.filters[key]["categories"][subkey] = false
            }
        }
        $(this._element).find('.filter[type="checkbox"]').prop("checked", false)
        this.buildDetailFilter("none", "none").then(templ => {
            $(this._element).find('.advancedSearch .groupbox').html(templ)
        })
    }

    buildFilter(elem, parentCat = "Item") {
        let res = []
        Object.keys(elem.categories).forEach(function(key) {
            res.push({ label: game.i18n.localize(`TYPES.${parentCat}.${key}`), selected: elem.categories[key], key: key })
        })
        res = res.sort(function(a, b) {
            return a.label.localeCompare(b.label);
        });
        return res
    }

    static get defaultOptions() {
        const options = super.defaultOptions
        options.id = "DSA5ItemLibrary"
        options.classes.push("dsa5", "itemlibrary")
        options.height = 800
        options.width = 800
        options.resizable = true
        options.title = game.i18n.localize("ItemLibrary")
        options.template = "systems/dsa5/templates/system/itemlibrary.html"
        options.tabs = [{ navSelector: ".tabs", contentSelector: ".content", initial: "equipment" }]
        return options
    }

    async getRandomItems(category, limit) {
        let filteredItems = []
        let index = this.equipmentIndex
        filteredItems.push(...(await index.search(category, { field: ["itemType"] })))
        return (await Promise.all(this.shuffle(filteredItems.filter(x => x.hasPermission)).slice(0, limit + 5).map(x => x.getItem()))).filter(x => {
            const enchantments = x.getFlag("dsa5", "enchantments")
            return !enchantments || !enchantments.find(x => x.talisman)
        }).slice(0, limit)
    }

    shuffle(array) {
        let currentIndex = array.length,
            temporaryValue, randomIndex;

        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }

        return array;
    }

    async findCompendiumItem(search, category, filterCompendium = true) {
        await this.buildEquipmentIndex()
        
        const query = {
            field: ["name"],
            where: { itemType: category }
        }
        let result = await this.equipmentIndex.search(search, query)
        if (filterCompendium) result = result.filter(x => x.compendium != "")

        return await Promise.all(result.map(x => x.getItem()))
    }

    async getCategoryItems(category, asItemData = false, asItem = false) {
        await this.buildEquipmentIndex()
        const res = this.equipmentIndex.search(category, { field: ["itemType"] })
        if (asItemData)
            return (await Promise.all(res.map(x => x.getItem()))).map(x => x.toObject())
        else if(asItem)
            return (await Promise.all(res.map(x => x.getItem())))

        return res
    }

    async executeAdvancedFilter(search, index, selectSearches, textSearches, booleanSearches, rangeSearches = []) {
        const selFnct = (x) => {
            for (let k of selectSearches) {
                if (k[2] ? (x[k[0]] != k[1]) : (x[k[0]].indexOf(k[1]) == -1)) return false
            }
            return true
        }
        const txtFnct = (x) => {
            for (let k of textSearches) {
                if (x[k[0]].toLowerCase().indexOf(k[1]) == -1) return false
            }
            return true
        }
        const cbFnct = (x) => {
            for (let k of booleanSearches) {
                if (x[k[0]] != k[1]) return false
            }
            return true
        }

        const rangeFct = (x) => {
            for (let k of rangeSearches) {
                if (x[k[0]] < k[1] || x[k[0]] > k[2]) return false
            }
            return true
        }

        let result = index.where(x => (
                search == "" ||
                x.name.toLowerCase().indexOf(search) != -1) &&
            selFnct(x) &&
            txtFnct(x) &&
            cbFnct(x) &&
            rangeFct(x)
        )

        //this.pages[category].next = result.length

        let filteredItems = result
        filteredItems = filteredItems.filter(x => x.hasPermission).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1)

        return filteredItems
    }

    collectDetailSearch(htmlElement) {
        const sels = []
        const inps = []
        const checkboxes = []
        for (let elem of htmlElement.find('select')) {
            let val = $(elem).val()
            if (val != "") {
                sels.push([$(elem).attr("name"), val, elem.dataset.notstrict != "true"])
            }
        }
        for (let elem of htmlElement.find('input[type="text"]:not(.manualFilter)')) {
            let val = $(elem).val()
            if (val != "") {
                inps.push([$(elem).attr("name"), val.toLowerCase()])
            }
        }
        for (let elem of htmlElement.find('input[type="checkbox"]:checked:not(.manualFilter)')) {
            let val = $(elem).val()
            if (val != "") {
                checkboxes.push([$(elem).attr("name"), val.toLowerCase()])
            }
        }
        return { sels, inps, checkboxes }
    }

    async advancedFilterStuff(category, page) {
        const dataFilters = $(this._element).find('.detailFilters')
        const subcategory = dataFilters.attr("data-subc")
        const index = this.detailFilter[subcategory]
        const search = this.filters[category].filterBy.search.toLowerCase()
        const { sels, inps, checkboxes } = this.collectDetailSearch(dataFilters)
        let result = await this.executeAdvancedFilter(search, index, sels, inps, checkboxes)
        this.setBGImage(result, category)
        result = this.filterDuplications(result)
        return result
    }    

    async findEquipmentItemDetailed(search, category, filterCompendium = true) {
        await this.buildDetailFilter("Item", category)

        let index = this.detailFilter[category]

        let result = await this.executeAdvancedFilter(search.search || "", index, search.selects || [], search.inputs || [], search.booleans || [], search.rangeSearches || [])
        if (filterCompendium) result = result.filter(x => x.compendium != "")

        return await Promise.all(result.map(x => x.getItem()))
    }

    filterDuplications(filteredItems) {
        if(game.settings.get("dsa5", "filterDuplicateItems"))
            filteredItems = [...new Map(filteredItems.map(item => [`${item.name}_${item.type}`, item])).values()]

        return filteredItems
    }

    async filterStuff(category, index, page) {
        let search = this.filters[category].filterBy.search

        let fields = {
            field: ["name", "data"]
        }
        let filteredItems = []

        let oneFilterSelected = false
        for (let filter in this.filters[category].categories) {
            if (this.filters[category].categories[filter]) {
                let result
                let next = null
                if (search == "") {
                    result = index.search(filter, { field: ["itemType"], sort: "name", where: { itemType: filter }})
                } else {
                    result = index.search(search, {...fields, sort: "name", where: { itemType: filter }})
                }

                let startIndex = Number(page) || 0
                result = result.slice(startIndex, Math.min(startIndex + 60, result.length))

                if (result.length == 60) next = `${startIndex + 60}`

                this.pages[category].next = next
                filteredItems.push(...result)
            }
            oneFilterSelected = this.filters[category].categories[filter] || oneFilterSelected
        }

        if (!oneFilterSelected) {
            filteredItems = index.search(search, { ...fields, limit: 60, page: page || true, sort: "name"})
            this.pages[category].next = filteredItems.next
        }

        filteredItems = filteredItems.result ? filteredItems.result : filteredItems
        filteredItems = filteredItems.filter(x => x.hasPermission)
        this.setBGImage(filteredItems, category)

        return filteredItems
    }

    setBGImage(filterdItems, category) {
        $(this._element).find(`.${category} .libcontainer`)[`${filterdItems.length > 0 ? "remove" : "add"}Class`]("libraryImg")
    }    

    async getItemTemplate(filteredItems, itemType) {
        if(this.browseEnabled && ["Item", "Actor"].includes(itemType)){
            return filteredItems.map(x => {
                return `<div class="uuid libItem loader col center" data-uuid="${x.uuid}"><i class="fas fa-spinner fa-spin fa-4x"></i></div>`
            }).join("")
        } else {
            const template = 'systems/dsa5/templates/system/libraryItem.html'
            return await renderTemplate(template, { items: filteredItems })
        }
    }

    async renderBrowseItem(uuid) {
        const document = await fromUuid(uuid)
        const template = `systems/dsa5/templates/items/browse/${document.type}.html`
        const item = await renderTemplate(template, { document, isGM: game.user.isGM, ...(await document.sheet.getData())})
        return `<div class="uuid libItem ${document.type} col" data-uuid="${uuid}" data-item-id="${document.id}">${item}</div>`
    }

    intersectionObserved(entries, observer) {
        for (let entry of entries) {
            if (entry.isIntersecting) {
                const uuid = entry.target.dataset.uuid
                this.renderBrowseItem(uuid).then(html => {
                    entry.target.outerHTML = html
                })
                observer.unobserve(entry.target)
            }
        }
    }

    async renderResult(html, filteredItems, { index, itemType }, isPaged) {
        const resultField = html.find('.searchResult .item-list')
        let innerhtml = await this.getItemTemplate(filteredItems, itemType)
        if (!isPaged) resultField.empty()

        innerhtml = $(innerhtml)
        const itemDragStart = (event, index, type, pay = false) => {
            event.stopPropagation()
            let item = index.find(event.currentTarget.dataset.itemId)
            event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({
                type,
                uuid: item.uuid,
                pay
            }))
        }
        
        innerhtml.each(function() {
            const li = $(this)
            li.attr("draggable", true).on("dragstart", event => itemDragStart(event, index, itemType))
            li.find('.priceDrag').attr("draggable", true).on("dragstart", event => itemDragStart(event, index, itemType, true))
        })
        
        resultField.append(innerhtml)
        
        const items = resultField.find('.loader')
        if(items.length > 0) {
            const observer = new IntersectionObserver(this.intersectionObserved.bind(this), {root: html.find('.window-content')[0]});
            for (let item of items) {
                observer.observe(item)
            }
        }
    }

    async filterItems(html, category, page) {
        const index = this.selectIndex(category)
        const filteredItems = this.advancedFiltering && category != "journal" ? await this.advancedFilterStuff(category, page) : await this.filterStuff(category, index.index, page)
        await this.renderResult(html, filteredItems, index, page)
        return filteredItems
    }

    selectIndex(category) {
        let itemType = "Item"
        let index = this.equipmentIndex
        switch (category) {
            case "zoo":
                itemType = "Actor"
                index = this.zooIndex
                break
            case "journal":
                itemType = "JournalEntry"
                index = this.journalIndex
                break
        }
        return { index, itemType }
    }

    async _render(force = false, options = {}) {
        await super._render(force, options)
        this.buildEquipmentIndex()
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift({
            class: "libraryModulsFilter",
            tooltip: "DSASETTINGS.libraryModulsFilter",
            icon: "fas fa-filter",
            onclick: async() => new LibraryModulsFilter().render(true)
        })        
        return buttons
    }

    async buildEquipmentIndex() {
        await this._createIndex("equipment", "Item", game.items)
    }

    async _createIndex(category, document, worldStuff) {
        if (this[`${category}Build`]) return

        const filteredCompendiums = game.settings.get("dsa5", "libraryModulsFilter")
        SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: ""}), pct: 0})
        const target = $(this._element).find(`*[data-tab="${category}"]`)
        this.showLoading(target, category)
        const packs = game.packs.filter(p => p.documentName == document && (game.user.isGM || p.visible) && !p.metadata.label.startsWith("WZ-") && !filteredCompendiums[p.metadata.packageName])
        const percentage = 100 / (packs.length + 1)
        let count = percentage
        const actorFields = ["name", "system.type", "system.description.value", "img"]
        let func
        if (document == "Actor") {
            func = (p) => { return p.getIndex({actorFields})}
        } else if (document == "JournalEntry") {
            func = (p) => { return p.getDocuments()}
        } else {
            func = (p) => {return p.getDocuments({type__in: Object.keys(game.system.documentTypes.Item) })}
        }
        const items = this.indexWorldItems(worldStuff, category)
        SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: "world items"}), pct: Math.round(percentage)})

        let promise = packs.map(async(p) => {
            const index = await func(p)
            count += percentage
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: `${p.metadata.label} (${p.metadata.id})`}), pct: Math.round(count)})
            items.push(...index.map(x => new SearchDocument(x, p.metadata)))
        })

        return Promise.all(promise).then(indexes => {
            this[`${category}Index`].add(items)
            this[`${category}Build`] = true
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: ""}), pct: 100})
            this.hideLoading(target, category)
        })
    }

    subcategoryFields(subcategory) {
        let field = ["name", "itemType"]
        const attrs = ADVANCEDFILTERS[subcategory] || []
        for (let attr of attrs) {
            field.push(attr.attr)
        }
        return field
    }

    indexWorldItems(worldStuff, category) {
        const items = []
        if (game.settings.get("dsa5", "indexWorldItems")) {
            items.push(...worldStuff.filter(x => x.visible).map(x => new SearchDocument(x)))
            this[`${category}WorldBuild`] = true
        }
        return items
    }


    async createDetailIndex(category, subcategory) {
        if (!this.detailFilter[subcategory]) {
            const catName = game.i18n.localize(`TYPES.Item.${subcategory}`)
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: 0})
            const field = this.subcategoryFields(subcategory)
            const target = $(this._element).find(`*[data-tab="${category}"]`)
            target.find('.searchResult ul').html('')
            this.showLoading(target, category)
            this.detailFilter[subcategory] = new FlexSearch({
                encode: "simple",
                tokenize: "full",
                cache: true,
                doc: {
                    id: "id",
                    field
                }
            });

            const { index, itemType } = this.selectIndex(category)
            const worldStuff = itemType == "Item" ? game.items : game.actors

            const items = []
            
            if(game.settings.get("dsa5", "indexWorldItems")){
                items.push(...worldStuff.filter(x => x.visible && x.type == subcategory).map(x => new AdvancedSearchDocument(x, subcategory)))
            }

            const result = index.search(subcategory, { field: ["itemType"] })
            const pids = {}
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: 10})
            for (let res of result) {
                if (!res.document.pack) continue
                if (!pids[res.document.pack]) pids[res.document.pack] = []
                pids[res.document.pack].push(res.document.id)
            }
            const promises = []
            let percentage = 60 / Object.keys(pids).length
            let count = 0
            for (const key of Object.entries(pids)) {
                count += 1
                promises.push(game.packs.get(key[0]).getDocuments({ _id__in: key[1], type: subcategory }))
                SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: Math.round(10 + count * percentage)})
            }
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: 70})

            let final = await Promise.all(promises)
            percentage = 30 / final.length
            count = 0
            for (let k of final) {
                count += 1
                items.push(...k.map(x => new AdvancedSearchDocument(x, subcategory)))
                SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: Math.round(70 + count * percentage)})
            }
            this.detailFilter[subcategory].add(items)
            this.hideLoading(target, category)
            SceneNavigation.displayProgressBar({label: game.i18n.format('Library.loading', {item: catName}), pct: 100})
        }
    }

    async buildDetailFilter(category, subcategory, savedSettings = undefined) {
        const fields = duplicate(ADVANCEDFILTERS[subcategory] || [])
        let moduleSelected = false
        if (fields) {
            if(savedSettings) {
                for (let field of fields) {
                    switch(field.type) {
                        case "select":
                            const sel = savedSettings.selects.find(x => x[0] == field.attr)
                            if(sel) field.value = sel[1]
                            break
                        case "text":
                            const txt = savedSettings.inputs.find(x => x[0] == field.attr)
                            if(txt) field.value = txt[1]
                            break
                        case "checkbox":
                            const cb = savedSettings.booleans.find(x => x[0] == field.attr)
                            if(cb) field.value = cb[1]                            
                            break
                    }
                }
                moduleSelected = savedSettings.selects.find(x => x[0] == "compendium")?.[1]
            }

            const bindex = this.createDetailIndex(category, subcategory)
            const moduleOptions = DSA5ItemLibrary.collectModulOptions()
            const template = await renderTemplate("systems/dsa5/templates/system/detailFilter.html", { fields, subcategory, moduleOptions, moduleSelected })
            await bindex
            return template
        } else {
            return `<p>${game.i18n.localize('Library.selectAdvanced')}</p>`
        }
    }

    static collectModulOptions() {
        return game.packs.filter(x => x.metadata.type == "Item").reduce((prev, cur) => {
            if(!prev[cur.metadata.packageName]) {
                const name = game.i18n.has(`${cur.metadata.packageName}.name`) ? game.i18n.localize(`${cur.metadata.packageName}.name`) : (game.modules.get(cur.metadata.packageName)?.title.replace(/The Dark Eye 5th Ed. - /i, "") || game.system.title)
                prev[cur.metadata.packageName] = name
            }
            return prev
        }, {})
    }

    checkWorldStuffIndex() {
        if (game.settings.get("dsa5", "indexWorldItems")) {
            if (!this.journalWorldBuild && this.journalBuild) {
                this.journalIndex.add(this.indexWorldItems(game.journal, "journal"))
            }
            if (!this.equipmentWorldBuild && this.equipmentBuild) {
                this.equipmentIndex.add(this.indexWorldItems(game.items, "equipment"))
            }
            if (!this.zooWorldBuild && this.zooBuild) {
                this.zooIndex.add(this.indexWorldItems(game.actors, "zoo"))
            }
        }
    }

    activateListeners(html) {
        super.activateListeners(html)

        tabSlider(html)

        html.on('click', '.searchableAbility a', ev => clickableAbility(ev))

        html.on("click", ".toggleAdvancedMode", () => {
            this.advancedFiltering = !this.advancedFiltering
            if (this.advancedFiltering) {
                $(this._element).find('.toggleAdvancedMode').addClass("on")
                $(this._element).find('.advancedSearch').fadeIn()
                this.purgeAdvancedFilters()
            } else {
                $(this._element).find('.toggleAdvancedMode').removeClass("on")
                $(this._element).find('.advancedSearch').fadeOut()
            }
        })

        html.on("change", ".detailFilters input, .detailFilters select", () => {
            const tab = $(this._element).find('.tab.active')
            const category = tab.attr("data-tab")
            this.filterItems(tab, category);
        })

        html.on("click", ".filter", async(ev) => {
            const tab = $(ev.currentTarget).closest('.tab')
            const category = tab.attr("data-tab")
            const subcategory = ev.currentTarget.dataset.category
            const isChecked = $(ev.currentTarget).is(":checked")
            if (this.advancedFiltering && isChecked) {
                this.purgeAdvancedFilters()
                this.subcategory = subcategory
                $(ev.currentTarget).prop("checked", isChecked)
                $(this._element).find('.advancedSearch .groupbox').html(await this.buildDetailFilter(category, subcategory))
            }
            this.filters[category].categories[subcategory] = isChecked
            this.filterItems(tab, category);
        })

        html.on("click", ".item-name", ev => {
            this.getItemFromHTML(ev).render()
        })

        html.on("mousedown", ".item-name", ev => {
            if (ev.button == 2) DSA5_Utility.showArtwork(this.getItemFromHTML(ev))
        })

        html.on("keyup", ".filterBy-search", ev => {
            const tab = $(ev.currentTarget).closest('.tab')
            const category = tab.attr("data-tab")
            this.filters[category].filterBy.search = $(ev.currentTarget).val();
            this.filterItems(tab, category);
        })

        const itemDragStart = (event) => {
            event.stopPropagation()
            const type = event.currentTarget.dataset.type
            const uuid = event.currentTarget.dataset.uuid
            if(!uuid || !type) return

            event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({
                type,
                uuid
            }))
        }
        html.on('click', '.show-item', async(ev) => {
            let itemId = ev.currentTarget.dataset.uuid
            const item = await fromUuid(itemId)
            item.sheet.render(true)
        })
        html.find('.show-item').attr("draggable", true).on("dragstart", event => itemDragStart(event))

        html.find(`*[data-tab="journal"]`).click(x => {
            this._createIndex("journal", "JournalEntry", game.journal)
        })
        html.find(`*[data-tab="zoo"]`).click(x => {
            this._createIndex("zoo", "Actor", game.actors)
        })

        html.find('.showDetails').click(ev => {
            const tab = ev.currentTarget.dataset.btn
            $(ev.currentTarget).find('i').toggleClass("fa-caret-left fa-caret-right")
            html.find(`.${tab} .detailBox`).toggleClass("dsahidden")
        })

        html.find('.toggleWorldIndex').click((ev) => {
            game.settings.set("dsa5", "indexWorldItems", !game.settings.get("dsa5", "indexWorldItems"))
            this.checkWorldStuffIndex()
            $(ev.currentTarget).toggleClass("on")
        })
        html.find('.fulltextsearch').click((ev) => {
            game.settings.set("dsa5", "indexDescription", !game.settings.get("dsa5", "indexDescription"))
            $(ev.currentTarget).toggleClass("on")
        })
        html.find('.browseEnabled').click((ev) => {
            this.browseEnabled = !this.browseEnabled
            $(ev.currentTarget).toggleClass("on")
        })
        html.find('.filterDuplicateItems').click((ev) => {
            game.settings.set("dsa5", "filterDuplicateItems", !game.settings.get("dsa5", "filterDuplicateItems"))
            $(ev.currentTarget).toggleClass("on")
        })

        const source = this

        $(this._element).find('.window-content').on('scroll.infinit', debounce(function(ev) {
                if (source.advancedFiltering) return

                const log = $(ev.target);
                const pct = (log.scrollTop() + log.innerHeight()) >= log[0].scrollHeight - 100;
                const category = html.find('.tabs .item.active').attr("data-tab")
                if (pct && source.pages[category].next) {
                    const tab = html.find('.tab.active')
                    source.filterItems.call(source, tab, category, source.pages[category].next)
                }
            },
            100));
    }

    getItemFromHTML(ev) {
        const itemId = $(ev.currentTarget).parents(".browser-item").attr("data-item-id")
        const type = $(ev.currentTarget).closest('.tab').attr("data-tab")
        switch (type) {
            case "zoo":
                return this.zooIndex.find(itemId)
            case "journal":
                return this.journalIndex.find(itemId)
            default:
                return this.equipmentIndex.find(itemId)
        }
    }

    showLoading(html, category) {
        this.setBGImage([1], category)
        const loading = $(`<div class="loader"><i class="fa fa-4x fa-spinner fa-spin"></i>${game.i18n.localize('Library.buildingIndex')}</div>`)
        loading.appendTo(html.find('.searchResult'))
    }

    hideLoading(html, category) {
        this.setBGImage([], category)
        html.find('.loader').remove()
    }
}

class LibraryModulsFilter extends Application {
    static get defaultOptions() {
        const options = super.defaultOptions
        options.classes.push("dsa5")
        options.resizable = true
        options.width = 600
        options.title = game.i18n.localize("DSASETTINGS.libraryModulsFilter")
        options.template = "systems/dsa5/templates/system/librarymodulesfilter.html"
        return options
    }

    async getData(options) {
        const data = await super.getData(options)

        mergeObject(data, {
                moduleOptions: DSA5ItemLibrary.collectModulOptions(),
                rejectedModules: game.settings.get("dsa5", "libraryModulsFilter")
        })
        return data
    }   

    activateListeners(html) {
        super.activateListeners(html)

        html.find('.moduleSelector').change(ev => this.moduleFilterChanged(ev))
    }

    async moduleFilterChanged(ev) {
        const module = ev.currentTarget.id
        const checked = ev.currentTarget.checked

        const data = game.settings.get("dsa5", "libraryModulsFilter")
        if (checked) {
            delete data[module]
        } else {
            data[module] = true
        }

        game.settings.set("dsa5", "libraryModulsFilter", data)
    }
}