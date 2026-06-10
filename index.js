const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
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
  );
  let fields = [];
  switch (state.transform) {
    case "Rename a table":
      const tables = await Table.find({}, { cached: true });
      fields = [
        {
          name: "table",
          label: "Existing table",
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

    default:
      break;
  }
  const form = new Form({
    action: "/view/Refactoring",
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
          i({ class: "fas fa-spinner fa-spin" }),
        ),
      ),
    ),
    fields.length ? renderForm(form, req.csrfToken()) : "",
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
  switch (body.transform) {
    case "Rename a table":
      {
        const table = Table.findOne({ name: body.table });
        await table.rename(body.new_name);

        const pack = await renamer(body.table, body.new_name);
        res.sendWrap("Refactoring", [
          h4(`Renamed table "${body.table}" to "${body.new_name}"`),
          ["tables", "views", "pages", "triggers"]
            .map((k) =>
              pack[k].length
                ? div(
                    `Renamed references in the following ${k}: `,
                    pack[k].map((t) => t.name).join(","),
                  )
                : "",
            )
            .join(""),
          a(
            { href: "/view/Refactoring", class: "btn btn-primary mt-3" },
            "Return to refactoring",
          ),
        ]);
      }
      break;

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
