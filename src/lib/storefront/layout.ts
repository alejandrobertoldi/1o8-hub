/**
 * Amazon Stores layout: widgets sit on a white page with a uniform white
 * gutter around every module and between split tiles. The Hub used to stack
 * modules flush; these tokens keep the editor + portal in lockstep with live.
 */
export const STOREFRONT_GUTTER_PX = 12;

/** Tailwind `gap-3` = 12px. Used between modules and between split tiles. */
export const STOREFRONT_GUTTER_GAP_CLASS = "gap-3";

/** White Amazon page: same 12px as padding so the outer frame matches inner gutters. */
export const STOREFRONT_FRAME_CLASS = "flex flex-col gap-3 bg-white p-3";
