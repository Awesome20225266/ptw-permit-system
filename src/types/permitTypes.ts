// src/pages/permit/permitTypes.ts
// Shared types and constants for the PTW permit UI

export interface PTWFormData {
  // Header
  work_order_ids?: string[]
  permit_no?: string
  site_name?: string
  work_location?: string
  permit_validity_date?: string
  start_time?: string
  end_time?: string
  description_of_work?: string
  contractor_name?: string
  permit_receiver?: string

  // A. Hazards
  hz_live_dc_cables?: boolean
  hz_loose_connectors?: boolean
  hz_tracker_parts?: boolean
  hz_dust?: boolean
  hz_high_dc?: boolean
  hz_poor_grounding?: boolean
  hz_heavy_panels?: boolean
  hz_wildlife?: boolean
  hz_arc_flash?: boolean
  hz_working_height?: boolean
  hz_sharp_edges?: boolean
  hz_lightning?: boolean
  hz_improper_grounding?: boolean
  hz_wet_surfaces?: boolean
  hz_heat?: boolean
  hz_overload?: boolean
  hz_manual_handling?: boolean
  hz_overhead_line?: boolean
  hz_others_text?: string

  // B. Risks
  rk_electrocution?: boolean
  rk_burns?: boolean
  rk_unexpected_energization?: boolean
  rk_heat_stress?: boolean
  rk_electric_shock?: boolean
  rk_fire?: boolean
  rk_crushing?: boolean
  rk_electric_burn?: boolean
  rk_fall?: boolean
  rk_back_injury?: boolean
  rk_bites?: boolean
  rk_falling_particles?: boolean
  rk_tripping?: boolean
  rk_others_text?: string

  // C. PPE
  ppe_helmet?: boolean
  ppe_hrc_suit?: boolean
  ppe_respirator?: boolean
  ppe_harness?: boolean
  ppe_shoes?: boolean
  ppe_electrical_mat?: boolean
  ppe_dust_mask?: boolean
  ppe_lifeline?: boolean
  ppe_reflective_vest?: boolean
  ppe_face_shield?: boolean
  ppe_ear_plugs?: boolean
  ppe_cut_gloves?: boolean
  ppe_goggles?: boolean
  ppe_insulated_tools?: boolean
  ppe_electrical_gloves?: boolean
  ppe_others_text?: string

  // D. Safety Precautions
  sp_electrical_isolation?: boolean
  sp_fire_extinguisher?: boolean
  sp_proper_isolation?: boolean
  sp_authorized_personnel?: boolean
  sp_loto?: boolean
  sp_signage?: boolean
  sp_rescue_equipment?: boolean
  sp_zero_voltage?: boolean
  sp_earthing?: boolean
  sp_pre_job_meeting?: boolean
  sp_insulated_tools?: boolean
  sp_illumination?: boolean
  sp_escape_route?: boolean
  sp_others_text?: string

  // E. Associated Permits
  ap_hot_work?: boolean
  ap_night_work?: boolean
  ap_height_work?: boolean
  ap_general_work?: boolean
  ap_excavation?: boolean
  ap_lifting?: boolean
  ap_loto?: boolean
  ap_confined_space?: boolean
  ap_others_text?: string

  // F. Tools & Equipment
  tools_equipment?: string

  // G. Issuer Safety Checklist (Y/N/NA)
  chk_jsa?: string
  chk_environment?: string
  chk_loto?: string
  chk_fire_fighting?: string
  chk_energized_ppe?: string
  chk_rescue?: string
  chk_workers_fit?: string
  chk_grounded?: string
  chk_tools?: string
  chk_lighting?: string
  chk_rescue_plan?: string
  chk_signage?: string
  chk_testing_equipment?: string
  chk_conductive_removed?: string
  chk_line_clearance?: string
  chk_briefing?: string

  // H. People
  receiver_name?: string
  holder_name?: string
  issuer_name?: string
  coworker_1?: string
  coworker_2?: string
  coworker_3?: string
  coworker_4?: string
  coworker_5?: string
  coworker_6?: string

  // I. Undertaking
  undertaking_accept?: boolean
}

export const HAZARD_FIELDS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'hz_live_dc_cables',    label: 'Live DC cables' },
  { key: 'hz_high_dc',           label: 'High DC voltage' },
  { key: 'hz_arc_flash',         label: 'Arc flash / short circuit' },
  { key: 'hz_improper_grounding',label: 'Improper grounding' },
  { key: 'hz_overload',          label: 'Overloaded circuits' },
  { key: 'hz_loose_connectors',  label: 'Loose connectors' },
  { key: 'hz_poor_grounding',    label: 'Poor grounding/earthing' },
  { key: 'hz_working_height',    label: 'Working at height' },
  { key: 'hz_wet_surfaces',      label: 'Wet surfaces' },
  { key: 'hz_manual_handling',   label: 'Manual handling' },
  { key: 'hz_tracker_parts',     label: 'Tracker moving parts' },
  { key: 'hz_heavy_panels',      label: 'Heavy solar panels' },
  { key: 'hz_sharp_edges',       label: 'Sharp edges' },
  { key: 'hz_heat',              label: 'High ambient temp / sun' },
  { key: 'hz_overhead_line',     label: 'Overhead line' },
  { key: 'hz_dust',              label: 'Dust accumulation' },
  { key: 'hz_wildlife',          label: 'Wildlife / snakes' },
  { key: 'hz_lightning',         label: 'Lightning / storm' },
]

export const RISK_FIELDS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'rk_electrocution',          label: 'Electrocution' },
  { key: 'rk_electric_shock',         label: 'Electric shock' },
  { key: 'rk_electric_burn',          label: 'Electric burn' },
  { key: 'rk_unexpected_energization',label: 'Unexpected energization' },
  { key: 'rk_fall',                   label: 'Fall causing injury' },
  { key: 'rk_tripping',               label: 'Tripping / slipping' },
  { key: 'rk_falling_particles',      label: 'Falling particles' },
  { key: 'rk_crushing',               label: 'Crushing / pinching' },
  { key: 'rk_burns',                  label: 'Burns / equipment damage' },
  { key: 'rk_fire',                   label: 'Fire or overheating' },
  { key: 'rk_heat_stress',            label: 'Heat stress / dehydration' },
  { key: 'rk_bites',                  label: 'Bites / stings' },
  { key: 'rk_back_injury',            label: 'Back / muscle injury' },
]

export const PPE_FIELDS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'ppe_helmet',          label: 'Safety Helmet' },
  { key: 'ppe_shoes',           label: 'Safety Shoes' },
  { key: 'ppe_electrical_gloves',label: 'Electrical Gloves' },
  { key: 'ppe_harness',         label: 'Full Body Harness' },
  { key: 'ppe_reflective_vest', label: 'Reflective Vest' },
  { key: 'ppe_goggles',         label: 'Safety Goggles' },
  { key: 'ppe_face_shield',     label: 'Face Shield (arc)' },
  { key: 'ppe_lifeline',        label: 'Lifeline / Anchor' },
  { key: 'ppe_hrc_suit',        label: 'HRC Suit' },
  { key: 'ppe_electrical_mat',  label: 'Electrical Mat' },
  { key: 'ppe_insulated_tools', label: 'Insulated Tools' },
  { key: 'ppe_cut_gloves',      label: 'Cut-Resistant Gloves' },
  { key: 'ppe_respirator',      label: 'Respirator' },
  { key: 'ppe_dust_mask',       label: 'Dust Mask' },
  { key: 'ppe_ear_plugs',       label: 'Ear Plugs / Muffs' },
]

export const PRECAUTION_FIELDS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'sp_electrical_isolation', label: 'Electrical isolation' },
  { key: 'sp_proper_isolation',     label: 'Proper isolation' },
  { key: 'sp_loto',                 label: 'LOTO applied' },
  { key: 'sp_earthing',             label: 'Earthing / grounding' },
  { key: 'sp_fire_extinguisher',    label: 'Fire extinguisher / first aid' },
  { key: 'sp_authorized_personnel', label: 'Authorized personnel only' },
  { key: 'sp_signage',              label: 'Warning signage placed' },
  { key: 'sp_insulated_tools',      label: 'Insulated tools' },
  { key: 'sp_rescue_equipment',     label: 'Rescue equipment at site' },
  { key: 'sp_zero_voltage',         label: 'Zero voltage verified' },
  { key: 'sp_pre_job_meeting',      label: 'Pre-job safety meeting' },
  { key: 'sp_escape_route',         label: 'Escape route clear' },
  { key: 'sp_illumination',         label: 'Adequate illumination' },
]

export const ASSOCIATED_PERMITS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'ap_hot_work',      label: 'Hot Work Permit' },
  { key: 'ap_loto',          label: 'LOTO Permit' },
  { key: 'ap_height_work',   label: 'Height Work Permit' },
  { key: 'ap_general_work',  label: 'General Work Permit' },
  { key: 'ap_night_work',    label: 'Night Work Permit' },
  { key: 'ap_lifting',       label: 'Lifting Permit' },
  { key: 'ap_excavation',    label: 'Excavation Permit' },
  { key: 'ap_confined_space',label: 'Confined Space Permit' },
]

export const ISSUER_CHECKS: Array<{ key: keyof PTWFormData; label: string }> = [
  { key: 'chk_jsa',                label: 'Is JSA carried out?' },
  { key: 'chk_environment',        label: 'Is environment condition suitable?' },
  { key: 'chk_loto',               label: 'Is equipment de-energized / LOTO applied?' },
  { key: 'chk_fire_fighting',      label: 'Firefighting equipment available?' },
  { key: 'chk_energized_ppe',      label: 'PPE procedure for energized work?' },
  { key: 'chk_rescue',             label: 'Rescue equipment available?' },
  { key: 'chk_workers_fit',        label: 'Workers medically fit & trained?' },
  { key: 'chk_grounded',           label: 'Equipment properly grounded?' },
  { key: 'chk_tools',              label: 'Tools inspected & rated for voltage?' },
  { key: 'chk_lighting',           label: 'Adequate lighting present?' },
  { key: 'chk_rescue_plan',        label: 'Rescue plan in place?' },
  { key: 'chk_signage',            label: 'Warning signage placed?' },
  { key: 'chk_testing_equipment',  label: 'Testing equipment calibrated?' },
  { key: 'chk_conductive_removed', label: 'Conductive items removed from area?' },
  { key: 'chk_line_clearance',     label: 'Line clearance obtained?' },
  { key: 'chk_briefing',           label: 'Safety requirements explained to team?' },
]
