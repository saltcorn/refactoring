const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const View = require("@saltcorn/data/models/view");
const Page = require("@saltcorn/data/models/page");
const Trigger = require("@saltcorn/data/models/trigger");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { interpolate } = require("@saltcorn/data/utils");
const {
  text,
  div,
  h5,
  h4,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  text_attr,
  select,
  option,
  span,
} = require("@saltcorn/markup/tags");
const { mkTable, renderForm } = require("@saltcorn/markup");
const { readState } = require("@saltcorn/data/plugin-helper");
const { features, getState } = require("@saltcorn/data/db/state");
const { renamer } = require("./renamer");
const { detect_dead_entities } = require("./dead-entity-detector");

const run = async (table_id, viewname, cfg, state, { res, req }) => {
  const option_ = (s) => option({ selected: state.transform == s }, s);

  const selector = select(
    {
      class: "form-select form-control w-50 d-inline-block",
      onchange:
        "$('#trans-sel-spin').show();set_state_field('transform',this.value)",
    },
    option(
      { disabled: true, selected: !state.transform },
      "Select a transform",
    ),
    option_("Rename a table"),
    option_("Rename a view"),
    option_("Dead entity elimination"),
  );
  let fields = [],
    blurb,
    labelCols,
    submitLabel = "Change", extra_html="";
  switch (state.transform) {
    case "Rename a table":
      const tables = await Table.find({}, { cached: true });
      fields = [
        {
          name: "table",
          label: "Table",
          type: "String",
          required: true,
          attributes: { options: tables.map((t) => t.name) },
        },
        {
          name: "new_name",
          label: "New name",
          type: "String",
          required: true,
        },
      ];
      break;

    case "Rename a view":
      const views = await View.find({}, { cached: true });
      fields = [
        {
          name: "view",
          label: "View",
          type: "String",
          required: true,
          attributes: { options: views.map((t) => t.name) },
        },
        {
          name: "new_name",
          label: "New name",
          type: "String",
          required: true,
        },
      ];
      break;
    case "Dead entity elimination":
      const dead_names = await detect_dead_entities();
      fields = ["tables", "views", "pages", "triggers"]
        .map((entType) =>
          [...dead_names[entType]].map((entName) => ({
            name: `${entType}_${entName}`,
            label: entName,
            sublabel: entType.slice(0, -1),
            type: "Bool",
          })),
        )
        .flat(1);
      labelCols = 4;
      submitLabel = "Delete";
      blurb = `These entities had no detectable connection to the entrypoints of your application, but they may be connected in some other way. Verify before deleting.`;
      if(!fields.length) extra_html = "No dead entities found"
    default:
      break;
  }
  const form = new Form({
    action: "/view/Refactoring",
    onSubmit: "press_store_button(this)",
    submitLabel,
    labelCols,
    blurb,
    fields: [{ name: "transform", input_type: "hidden" }, ...fields],
    values: { transform: state.transform },
  });

  return div(
    div(
      { class: "row mb-3" },
      div({ class: "col-sm-2 text-md-end" }, "Transform"),
      div(
        { class: "col-sm-10" },
        selector,
        span(
          { id: "trans-sel-spin", style: "display:none" },
          i({ class: "ms-2 fas fa-spinner fa-spin" }),
        ),
      ),
    ),
    fields.length ? renderForm(form, req.csrfToken()) : "",
    extra_html
  );
};
const runPost = async (
  table_id,
  viewname,
  config,
  state,
  body,
  { req, res },
) => {
  const return_link = a(
    { href: "/view/Refactoring", class: "btn btn-primary mt-3" },
    "Return to refactoring",
  );
  const pack_changes = (pack) =>
    ["tables", "views", "pages", "triggers"]
      .map((k) =>
        pack[k].length
          ? div(
              `Renamed references in the following ${k}: `,
              pack[k].map((t) => t.name).join(","),
            )
          : "",
      )
      .join("");
  switch (body.transform) {
    case "Rename a table":
      {
        const table = Table.findOne({ name: body.table });
        await table.rename(body.new_name);
        await getState().refresh_pages();
        const pack = await renamer(body.table, body.new_name);
        res.sendWrap("Refactoring", [
          h4(`Renamed table "${body.table}" to "${body.new_name}"`),
          pack_changes(pack),
          return_link,
        ]);
      }
      break;
    case "Rename a view":
      {
        const view = await View.findOne({ name: body.view });
        await View.update({ name: body.new_name }, view.id);
        await getState().refresh_views();
        const pack = await renamer(body.view, body.new_name);
        res.sendWrap("Refactoring", [
          h4(`Renamed view "${body.view}" to "${body.new_name}"`),
          pack_changes(pack),
          return_link,
        ]);
      }
      break;
    case "Dead entity elimination":
      const dead_names = await detect_dead_entities();
      
      for (const name of dead_names.triggers)        
        if (body[`triggers_${name}`]) await Trigger.findOne({ name }).delete();
      for (const name of dead_names.pages)
        if (body[`pages_${name}`]) await Page.findOne({ name }).delete();
      for (const name of dead_names.views)
        if (body[`views_${name}`]) await View.findOne({ name }).delete();
      for (const name of dead_names.tables)
        if (body[`tables_${name}`]) await Table.findOne({ name }).delete();
      await getState().refresh_tables();
      await getState().refresh_views();
      await getState().refresh_pages();
      await getState().refresh_triggers();
      res.redirect("/view/Refactoring");
    default:
      break;
  }
};

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "sql",
  viewtemplates: [
    {
      name: "Refactoring",
      display_state_form: false,
      tableless: true,
      singleton: true,
      get_state_fields: () => [],
      run,
      runPost,
      //routes: {},
    },
  ],
};
