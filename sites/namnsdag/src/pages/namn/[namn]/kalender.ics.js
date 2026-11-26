// /namn/ture/kalender.ics – lägg in namnsdagen som årligen återkommande händelse i mobilens kalender.
import { NAMNSIDOR, ics } from "../../../lib/namnsidor.js";
import { SITE } from "../../../site.js";

export function getStaticPaths() {
  return NAMNSIDOR.map((s) => ({ params: { namn: s.slug }, props: s }));
}

export function GET({ props }) {
  const namn = props.typ === "variant" ? props.v.namn : props.n.namn;
  return new Response(ics(namn, props.n, `${SITE.url}/namn/${props.slug}/`), {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
