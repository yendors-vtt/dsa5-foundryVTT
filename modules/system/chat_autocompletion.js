import DSA5_Utility from "./utility-dsa5.js"

export default class DSA5ChatAutoCompletion {
    //Special thanks to BlueBirdBlackSky and DJ Addi

    constructor() {
        this.skills = []
        DSA5_Utility.allSkills().then(res => {
            this.skills = res.map(x => x.name)
        })
        this.regex = /^\/(sk|at|pa|sp|li) /
        this.filtering = false
        this.constants = {
            dodge: game.i18n.localize("dodge"),
            parryWeaponless: game.i18n.localize("parryWeaponless"),
            attackWeaponless: game.i18n.localize("attackWeaponless")
        }
    }

    async chatListeners(html) {
        let target = this
        this.anchor = $('#chat-message').parent()
        $('#chat-message').off('keydown')
        html.on('keyup', '#chat-message', async function(ev) {
            target._parseInput(ev)
        })
        html.on('click', '.quick-item', async function(ev) {
            target._quickSelect($(ev.currentTarget))
        })
        html.on('keydown', '#chat-message', function(ev) {
            target._navigateQuickFind(ev)
        })
    }

    _parseInput(ev) {
        let val = ev.target.value
        if (this.regex.test(val)) {
            if ([38, 40, 13].includes(ev.which))
                return false
            let cmd = val.substring(1, 3).toUpperCase()
            let search = val.substring(3).toLowerCase().trim()
            this[`_filter${cmd}`](search)
            this.filtering = true
        } else {
            this.filtering = false
            this.anchor.find(".quickfind").remove()
        }
    }

    _filterAT(search) {
        let actor = this._getActor()
        if (actor) {
            let types = ["meleeweapon", "rangeweapon"]
            let result = actor.data.items.filter(x => { return types.includes(x.type) && x.name.toLowerCase().trim().indexOf(search) != -1 }).slice(0, 5).map(x => x.name)
                .concat([this.constants.attackWeaponless].filter(x => x.toLowerCase().trim().indexOf(search) != -1))
            if (!result.length)
                result.push(game.i18n.localize("Error.noMatch"))
            this._setList(result, "AT")
        }
    }

    _filterPA(search) {
        let actor = this._getActor()
        if (actor) {
            let types = ["meleeweapon"]
            let result = actor.data.items.filter(x => { return types.includes(x.type) && x.name.toLowerCase().trim().indexOf(search) != -1 && x.data.worn.value == true }).slice(0, 5).map(x => x.name)
                .concat([this.constants.dodge, this.constants.parryWeaponless].filter(x => x.toLowerCase().trim().indexOf(search) != -1))

            if (!result.length)
                result.push(game.i18n.localize("Error.noMatch"))
            this._setList(result, "PA")
        }
    }

    _filterSP(search) {
        let actor = this._getActor()
        if (actor) {
            let types = ["spell", "ritual"]
            let result = actor.data.items.filter(x => { return types.includes(x.type) && x.name.toLowerCase().trim().indexOf(search) != -1 }).slice(0, 5).map(x => x.name)
            if (!result.length)
                result.push(game.i18n.localize("Error.noMatch"))
            this._setList(result, "SP")
        }
    }

    _filterLI(search) {
        let actor = this._getActor()
        if (actor) {
            let types = ["liturgy", "ceremony"]
            let result = actor.data.items.filter(x => { return types.includes(x.type) && x.name.toLowerCase().trim().indexOf(search) != -1 }).slice(0, 5).map(x => x.name)
            if (!result.length)
                result.push(game.i18n.localize("Error.noMatch"))
            this._setList(result, "LI")
        }
    }

    _filterSK(search) {
        let result = this.skills.filter(x => { return x.toLowerCase().trim().indexOf(search) != -1 }).slice(0, 5)
        if (!result.length)
            result.push(game.i18n.localize("Error.noMatch"))
        this._setList(result, "SK")
    }

    _setList(result, cmd) {
            let html = $(`<div class="quickfind dsalist"><ul><li class="quick-item" data-category="${cmd}">${result.join(`</li><li data-category="${cmd}" class="quick-item">`)}</li></ul></div>`)
        html.find(`.quick-item:first`).addClass("focus")
        let quick = this.anchor.find(".quickfind")
        if (quick.length) {
            quick.replaceWith(html)
        } else {
            this.anchor.append(html)
        }
    }

    _navigateQuickFind(ev) {
        if (this.filtering) {
            let target = this.anchor.find('.focus')
            switch (ev.which) {
                case 38: // Up
                    if (target.prev(".quick-item").length)
                        target.removeClass("focus").prev(".quick-item").addClass("focus")
                    return false;
                case 40: // Down
                    if (target.next(".quick-item").length)
                        target.removeClass("focus").next(".quick-item").addClass("focus")
                    return false;
                case 13: // Enter
                    ev.stopPropagation()
                    ev.preventDefault()
                    this._quickSelect(target);
                    return false;
            }
        }
        ui.chat._onChatKeyDown(ev);
    }

    _getActor() {
        const speaker = ChatMessage.getSpeaker();
        let actor;
        if (speaker.token) actor = game.actors.tokens[speaker.token];
        if (!actor) actor = game.actors.get(speaker.actor);

        if (!actor) {
            ui.notifications.error(game.i18n.localize("Error.noProperActor"))
            return
        }
        return actor
    }

    _quickSelect(target) {
        let actor = this._getActor()
        if (actor) {
            $('#chat-message').val("")
            this.anchor.find(".quickfind").remove()
            this[`_quick${target.attr("data-category")}`](target, actor)
        }
    }

    _quickSK(target, actor) {
        let skill = actor.items.find(i => i.name == target.text() && i.type == "skill")
        if (skill) {
            actor.setupSkill(skill.data).then(setupData => {
                actor.basicTest(setupData)
            });
        }
    }

    _quickPA(target, actor) {

        let text = target.text()

        if (this.constants.dodge == text) {
            actor.setupStatus("dodge", {}).then(setupData => {
                actor.basicTest(setupData)
            });
        } else if (this.constants.parryWeaponless == text) {
            actor.setupWeaponless("parry", {}).then(setupData => {
                actor.basicTest(setupData)
            });
        }
        else {
            let types = ["meleeweapon"]
            let result = actor.data.items.find(x => { return types.includes(x.type) && x.name == target.text })
            if (result) {
                actor.setupWeapon(result, "parry", {}).then(setupData => {
                    actor.basicTest(setupData)
                });
            }
        }
    }
    _quickAT(target, actor) {
        let text = target.text()
        if (this.constants.attackWeaponless == text) {
            actor.setupWeaponless("attack", {}).then(setupData => {
                actor.basicTest(setupData)
            });
        }
        else {
            let types = ["meleeweapon", "rangeweapon"]
            let result = actor.data.items.find(x => { return types.includes(x.type) && x.name == target.text() })
            if (result) {
                actor.setupWeapon(result, "attack", {}).then(setupData => {
                    actor.basicTest(setupData)
                });
            }
        }
    }
    _quickSP(target, actor) {
        let types = ["ritual", "spell"]
        let result = actor.data.items.find(x => { return types.includes(x.type) && x.name == target.text() })
        if (result) {
            actor.setupSpell(result).then(setupData => {
                actor.basicTest(setupData)
            });
        }
    }
    _quickLI(target, actor) {
        let types = ["liturgy", "ceremony"]
        let result = actor.data.items.find(x => { return types.includes(x.type) && x.name == target.text() })
        if (result) {
            actor.setupSpell(result).then(setupData => {
                actor.basicTest(setupData)
            });
        }
    }

}