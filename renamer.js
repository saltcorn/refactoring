const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Page = require("@saltcorn/data/models/page");
const Trigger = require("@saltcorn/data/models/trigger");

const {
  table_pack,
  view_pack,
  plugin_pack,
  page_pack,
  page_group_pack,
  role_pack,
  library_pack,
  trigger_pack,
  tag_pack,
  model_pack,
  model_instance_pack,
  event_log_pack,
  install_pack,
} = require("@saltcorn/admin-models/models/pack");

const renamer = async (old_name, new_name) => {
  let pack = {
    plugins: [],
    tables: [],
    views: [],
    pages: [],
    triggers: [],
    config: {},
  };

  for (const table of await Table.find({})) {
    const tpack = JSON.stringify(await table_pack(table));
    if (tpack.includes(`"${old_name}"`))
      pack.tables.push(
        JSON.parse(tpack.replaceAll(`"${old_name}"`, `"${new_name}"`)),
      );
  }
  for (const view of await View.find({})) {
    const vpack = JSON.stringify(await view_pack(view));
    if (vpack.includes(`"${old_name}"`))
      pack.views.push(
        JSON.parse(vpack.replaceAll(`"${old_name}"`, `"${new_name}"`)),
      );
  }
  for (const page of await Page.find({})) {
    const ppack = JSON.stringify(await page_pack(page));
    if (ppack.includes(`"${old_name}"`))
      pack.pages.push(
        JSON.parse(ppack.replaceAll(`"${old_name}"`, `"${new_name}"`)),
      );
  }
  for (const trigger of await Trigger.find({})) {
    const trpack = JSON.stringify(await trigger_pack(trigger));
    if (trpack.includes(`"${old_name}"`))
      pack.triggers.push(
        JSON.parse(trpack.replaceAll(`"${old_name}"`, `"${new_name}"`)),
      );
  }
  await db.withTransaction(async () => {
    await install_pack(pack);
  });
  if (pack.tables.length) await getState().refresh_tables();
  if (pack.views.length) await getState().refresh_views();
  if (pack.pages.length) await getState().refresh_pages();
  if (pack.triggers.length) await getState().refresh_triggers();
  return pack;
};

module.exports = { renamer };
