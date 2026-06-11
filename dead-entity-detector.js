const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Page = require("@saltcorn/data/models/page");
const Trigger = require("@saltcorn/data/models/trigger");
const db = require("@saltcorn/data/db");
const { getState } = require("@saltcorn/data/db/state");
const { create_pack_json } = require("@saltcorn/admin-models/models/backup");

const detect_dead_entities = async () => {
  const live = {
    tables: new Set(),
    views: new Set(),
    pages: new Set(),
    triggers: new Set(),
  };
  const unknown = {
    tables: new Set(),
    views: new Set(),
    pages: new Set(),
    triggers: new Set(),
  };
  const packs = {
    tables: {},
    views: {},
    pages: {},
    triggers: {},
  };

  const full_pack = await create_pack_json(false, true);
  //entry points:
  //start pages, menu items, api call/time based triggers, views from config, users table
  for (const table of full_pack.tables) {
    packs.tables[table.name] = table;
    if (table.name === "users") live.tables.add(table.name);
    else unknown.tables.add(table.name);
  }

  const menu_items = JSON.stringify(getState().getConfig("menu_items", false));
  const search_settings = JSON.stringify(
    getState().getConfig("globalSearch", false),
  );

  for (const view of full_pack.views) {
    packs.views[view.name] = view;
    if (
      menu_items.includes(`"${view.name}"`) ||
      search_settings.includes(`"${view.name}"`)
    )
      live.views.add(view.name);
    else unknown.views.add(view.name);
  }

  const home_page_by_role = JSON.stringify(
    getState().getConfig("home_page_by_role", false),
  );

  for (const page of full_pack.pages) {
    packs.pages[page.name] = page;
    if (
      home_page_by_role.includes(`"${page.name}"`) ||
      menu_items.includes(`"${page.name}"`)
    )
      live.pages.add(page.name);
    else unknown.pages.add(page.name);
  }
  for (const trigger of full_pack.triggers) {
    packs.triggers[trigger.name] = trigger;
    if (
      [
        "Weekly",
        "Daily",
        "Hourly",
        "Often",
        "API call",
        "PageLoad",
        "Login",
        "LoginFailed",
        "Error",
        "Startup",
        "UserVerified",
        "ReceiveMobileShareData",
        "AppChange",
      ].includes(trigger.when_trigger)
    )
      live.triggers.add(trigger.name);
    else unknown.triggers.add(trigger.name);
  }
  let changed;
  do {
    changed = false;

    // loop here
    const livepack = {};
    ["tables", "views", "pages", "triggers"].forEach((entType) => {
      livepack[entType] = [];
      live[entType].forEach((entName) =>
        livepack[entType].push(packs[entType][entName]),
      );
    });
    const livepackStr = JSON.stringify(livepack);
    ["tables", "views", "pages", "triggers"].forEach((entType) => {
      unknown[entType].forEach((entName) => {
        const isTableTrigger =
          entType === "triggers" &&
          ["Insert", "Update", "Validate", "Delete"].includes(
            packs.triggers[entName].when_trigger,
          ) &&
          live.tables.has(packs.triggers[entName].table_name);
        const isInLivePack = livepackStr.includes(`"${entName}"`);
        const isViewLinked =
          entType === "views" && livepackStr.includes(`:${entName}"`);
        const isViewInURL =
          entType === "views" &&
          (livepackStr.includes(`/view/${entName}"`) ||
            livepackStr.includes(`/view/${encodeURIComponent(entName)}"`));
        const isAggRelation =
          entType === "tables" &&
          livepackStr.includes(`agg_relation":"${entName}.`);
        const isInRelation =
          entType === "tables" && livepackStr.includes(`"${entName}.`);
        if (
          isInLivePack ||
          isViewLinked ||
          isTableTrigger ||
          isAggRelation ||
          isViewInURL ||
          isInRelation
        ) {
          unknown[entType].delete(entName);
          live[entType].add(entName);
          changed = true;
        }
      });
    });
  } while (changed);

  return unknown;
};

module.exports = { detect_dead_entities };
