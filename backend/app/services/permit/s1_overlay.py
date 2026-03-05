"""
services/permit/s1_overlay.py — PTW PDF overlay renderer.

Contains:
  PTW_PDF_COORDINATES   — pixel-exact field positions per page
  _PTW_TAG_SOURCES      — maps overlay tags → form_data keys
  generate_ptw_pdf_from_template() — ReportLab overlay on PDF template

ALL content copied verbatim from S1.py with zero logic changes.
Only change: _download_pdf_template_from_supabase uses app.database.
"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Callable, Optional

from app.services.permit.s1_generate import _download_pdf_template_from_supabase


# ---------------------------------------------------------------------------
# Coordinate map (verbatim from S1.py)
# ---------------------------------------------------------------------------

PTW_PDF_COORDINATES: dict[str, dict[str, Any]] = {
    # Page 1 — Header
    "meta.permit_no": {"page": 1, "x": 166, "y": 666, "width": 181, "height": 19, "type": "text"},
    "meta.permit_validity_date": {"page": 1, "x": 461, "y": 665, "width": 118, "height": 20, "type": "text"},
    "meta.start_time": {"page": 1, "x": 166, "y": 644, "width": 184, "height": 16, "type": "text"},
    "meta.end_time": {"page": 1, "x": 458, "y": 646, "width": 123, "height": 17, "type": "text"},
    "meta.project_site_name": {"page": 1, "x": 163, "y": 626, "width": 188, "height": 15, "type": "text"},
    "meta.work_location": {"page": 1, "x": 456, "y": 624, "width": 121, "height": 19, "type": "text"},
    "meta.description_of_work": {"page": 1, "x": 158, "y": 605, "width": 422, "height": 16, "type": "text"},
    "meta.contractor_name": {"page": 1, "x": 161, "y": 582, "width": 419, "height": 17, "type": "text"},
    # Page 1 — Hazards
    "hazards.live_dc_cables": {"page": 1, "x": 34, "y": 529, "width": 9, "height": 11, "type": "checkbox"},
    "hazards.loose_or_damaged_connectors": {"page": 1, "x": 135, "y": 528, "width": 14, "height": 15, "type": "checkbox"},
    "hazards.moving_solar_tracker_parts": {"page": 1, "x": 288, "y": 531, "width": 11, "height": 10, "type": "checkbox"},
    "hazards.dust_accumulation_on_equipment": {"page": 1, "x": 417, "y": 529, "width": 15, "height": 13, "type": "checkbox"},
    "hazards.high_dc_voltage_from_pv_panels": {"page": 1, "x": 33, "y": 512, "width": 15, "height": 14, "type": "checkbox"},
    "hazards.poor_grounding_earthing": {"page": 1, "x": 135, "y": 507, "width": 14, "height": 14, "type": "checkbox"},
    "hazards.heavy_solar_panels": {"page": 1, "x": 288, "y": 507, "width": 11, "height": 12, "type": "checkbox"},
    "hazards.wildlife_snakes_insects_birds": {"page": 1, "x": 419, "y": 506, "width": 13, "height": 14, "type": "checkbox"},
    "hazards.arc_flash_short_circuit": {"page": 1, "x": 34, "y": 489, "width": 15, "height": 13, "type": "checkbox"},
    "hazards.working_at_height_rooftop_structure": {"page": 1, "x": 135, "y": 487, "width": 16, "height": 14, "type": "checkbox"},
    "hazards.sharp_panel_edges_metal_structures": {"page": 1, "x": 287, "y": 487, "width": 14, "height": 12, "type": "checkbox"},
    "hazards.lightning_or_stormy_weather": {"page": 1, "x": 417, "y": 479, "width": 15, "height": 17, "type": "checkbox"},
    "hazards.improper_grounding": {"page": 1, "x": 34, "y": 462, "width": 15, "height": 13, "type": "checkbox"},
    "hazards.wet_surfaces": {"page": 1, "x": 135, "y": 453, "width": 17, "height": 20, "type": "checkbox"},
    "hazards.high_ambient_temperature_sun_exposure": {"page": 1, "x": 285, "y": 463, "width": 15, "height": 12, "type": "checkbox"},
    "hazards.overloaded_circuits": {"page": 1, "x": 417, "y": 464, "width": 14, "height": 15, "type": "checkbox"},
    "hazards.manual_handling": {"page": 1, "x": 136, "y": 436, "width": 13, "height": 12, "type": "checkbox"},
    "hazards.overhead_line": {"page": 1, "x": 286, "y": 436, "width": 14, "height": 10, "type": "checkbox"},
    "hazards.if_others_text": {"page": 1, "x": 537, "y": 434, "width": 45, "height": 15, "type": "text"},
    # Page 1 — Risks
    "risks.electrocution": {"page": 1, "x": 31, "y": 388, "width": 15, "height": 15, "type": "checkbox"},
    "risks.burns_equipment_damage": {"page": 1, "x": 135, "y": 387, "width": 14, "height": 15, "type": "checkbox"},
    "risks.unexpected_energization": {"page": 1, "x": 286, "y": 387, "width": 14, "height": 15, "type": "checkbox"},
    "risks.heat_stress_dehydration": {"page": 1, "x": 286, "y": 387, "width": 14, "height": 15, "type": "checkbox"},
    "risks.electric_shock": {"page": 1, "x": 35, "y": 367, "width": 11, "height": 14, "type": "checkbox"},
    "risks.fire_or_overheating": {"page": 1, "x": 135, "y": 367, "width": 15, "height": 12, "type": "checkbox"},
    "risks.crushing_or_pinching_injuries": {"page": 1, "x": 285, "y": 370, "width": 18, "height": 17, "type": "checkbox"},
    "risks.if_others_text": {"page": 1, "x": 430, "y": 330, "width": 149, "height": 43, "type": "multiline"},
    "risks.electric_burn": {"page": 1, "x": 31, "y": 345, "width": 18, "height": 17, "type": "checkbox"},
    "risks.fall_causing_serious_injury": {"page": 1, "x": 135, "y": 346, "width": 14, "height": 13, "type": "checkbox"},
    "risks.back_or_muscle_injury": {"page": 1, "x": 288, "y": 348, "width": 12, "height": 11, "type": "checkbox"},
    "risks.bites_stings": {"page": 1, "x": 29, "y": 327, "width": 17, "height": 15, "type": "checkbox"},
    "risks.falling_particles": {"page": 1, "x": 136, "y": 327, "width": 14, "height": 15, "type": "checkbox"},
    "risks.tripping_slipping": {"page": 1, "x": 289, "y": 329, "width": 10, "height": 11, "type": "checkbox"},
    # Page 1 — PPE
    "ppe.safety_helmet": {"page": 1, "x": 31, "y": 271, "width": 15, "height": 15, "type": "checkbox"},
    "ppe.hrc_suit": {"page": 1, "x": 135, "y": 272, "width": 15, "height": 14, "type": "checkbox"},
    "ppe.respirators": {"page": 1, "x": 286, "y": 272, "width": 14, "height": 11, "type": "checkbox"},
    "ppe.full_body_safety_harness": {"page": 1, "x": 417, "y": 272, "width": 14, "height": 15, "type": "checkbox"},
    "ppe.safety_shoes": {"page": 1, "x": 32, "y": 254, "width": 13, "height": 13, "type": "checkbox"},
    "ppe.electrical_mat": {"page": 1, "x": 138, "y": 255, "width": 14, "height": 14, "type": "checkbox"},
    "ppe.dust_masks": {"page": 1, "x": 287, "y": 253, "width": 15, "height": 16, "type": "checkbox"},
    "ppe.lifeline_anchor_point": {"page": 1, "x": 417, "y": 253, "width": 15, "height": 15, "type": "checkbox"},
    "ppe.reflective_vest": {"page": 1, "x": 30, "y": 236, "width": 17, "height": 14, "type": "checkbox"},
    "ppe.face_shield_with_arc_protection": {"page": 1, "x": 135, "y": 237, "width": 14, "height": 15, "type": "checkbox"},
    "ppe.ear_plugs_muffs": {"page": 1, "x": 287, "y": 237, "width": 15, "height": 15, "type": "checkbox"},
    "ppe.cut_resistant_gloves": {"page": 1, "x": 417, "y": 237, "width": 13, "height": 14, "type": "checkbox"},
    "ppe.safety_goggles": {"page": 1, "x": 31, "y": 218, "width": 16, "height": 14, "type": "checkbox"},
    "ppe.insulated_hand_tools": {"page": 1, "x": 135, "y": 219, "width": 14, "height": 17, "type": "checkbox"},
    "ppe.electrical_hand_gloves": {"page": 1, "x": 286, "y": 216, "width": 14, "height": 17, "type": "checkbox"},
    "ppe.if_others_text": {"page": 1, "x": 418, "y": 221, "width": 13, "height": 15, "type": "text"},
    # Page 1 — Safety precautions
    "precautions.electrical_isolation": {"page": 1, "x": 32, "y": 160, "width": 15, "height": 19, "type": "checkbox"},
    "precautions.fire_extinguisher_first_aid": {"page": 1, "x": 134, "y": 158, "width": 18, "height": 16, "type": "checkbox"},
    "precautions.proper_isolation": {"page": 1, "x": 285, "y": 159, "width": 17, "height": 21, "type": "checkbox"},
    "precautions.authorized_competent_personnel": {"page": 1, "x": 415, "y": 165, "width": 15, "height": 16, "type": "checkbox"},
    "precautions.lockout_tagout": {"page": 1, "x": 33, "y": 133, "width": 13, "height": 19, "type": "checkbox"},
    "precautions.warning_signage_barricading": {"page": 1, "x": 136, "y": 144, "width": 11, "height": 10, "type": "checkbox"},
    "precautions.rescue_equipment_at_site": {"page": 1, "x": 288, "y": 135, "width": 12, "height": 17, "type": "checkbox"},
    "precautions.if_others_text": {"page": 1, "x": 420, "y": 103, "width": 162, "height": 36, "type": "multiline"},
    "precautions.zero_voltage_ensure": {"page": 1, "x": 35, "y": 115, "width": 11, "height": 15, "type": "checkbox"},
    "precautions.proper_earthing_grounding": {"page": 1, "x": 135, "y": 114, "width": 16, "height": 16, "type": "checkbox"},
    "precautions.pre_job_meeting": {"page": 1, "x": 286, "y": 114, "width": 16, "height": 17, "type": "checkbox"},
    "precautions.insulated_tools": {"page": 1, "x": 33, "y": 102, "width": 13, "height": 12, "type": "checkbox"},
    "precautions.proper_illumination": {"page": 1, "x": 135, "y": 102, "width": 15, "height": 14, "type": "checkbox"},
    "precautions.escape_route_clear": {"page": 1, "x": 283, "y": 100, "width": 19, "height": 14, "type": "checkbox"},
    # Page 2 — Associated permits
    "permits.hot_work_permit_no": {"page": 2, "x": 31, "y": 640, "width": 15, "height": 14, "type": "checkbox"},
    "permits.work_at_night_permit_no": {"page": 2, "x": 151, "y": 639, "width": 17, "height": 18, "type": "checkbox"},
    "permits.work_at_height_permit_no": {"page": 2, "x": 328, "y": 638, "width": 17, "height": 16, "type": "checkbox"},
    "permits.general_work_permit_no": {"page": 2, "x": 29, "y": 621, "width": 22, "height": 16, "type": "checkbox"},
    "permits.excavation_work_permit_no": {"page": 2, "x": 152, "y": 615, "width": 13, "height": 16, "type": "checkbox"},
    "permits.lifting_plan_permit_no": {"page": 2, "x": 328, "y": 614, "width": 17, "height": 18, "type": "checkbox"},
    "permits.loto_permit_no": {"page": 2, "x": 33, "y": 592, "width": 12, "height": 18, "type": "checkbox"},
    "permits.confined_space_permit_no": {"page": 2, "x": 150, "y": 591, "width": 17, "height": 18, "type": "checkbox"},
    "permits.if_others_text": {"page": 2, "x": 327, "y": 589, "width": 19, "height": 22, "type": "text"},
    # Page 2 — Tools / Equipment
    "tools_equipment.list_text": {"page": 2, "x": 32, "y": 492, "width": 549, "height": 62, "type": "multiline"},
    # Page 2 — Issuer checklist (tri-state)
    "issuer_checks.jsa_carried_out": {"page": 2, "x": 290, "y": 385, "width": 30, "height": 26, "type": "tri_state"},
    "issuer_checks.equipment_deenergized_loto": {"page": 2, "x": 292, "y": 360, "width": 29, "height": 19, "type": "tri_state"},
    "issuer_checks.energized_work_ppe_procedure": {"page": 2, "x": 285, "y": 333, "width": 38, "height": 20, "type": "tri_state"},
    "issuer_checks.workers_fit_trained_qualified": {"page": 2, "x": 292, "y": 307, "width": 33, "height": 22, "type": "tri_state"},
    "issuer_checks.tools_fit_for_voltage": {"page": 2, "x": 292, "y": 307, "width": 33, "height": 22, "type": "tri_state"},
    "issuer_checks.rescue_plan_available": {"page": 2, "x": 287, "y": 252, "width": 38, "height": 24, "type": "tri_state"},
    "issuer_checks.testing_equipment_compatible": {"page": 2, "x": 286, "y": 224, "width": 40, "height": 25, "type": "tri_state"},
    "issuer_checks.line_clearance_taken": {"page": 2, "x": 287, "y": 189, "width": 36, "height": 29, "type": "tri_state"},
    "issuer_checks.environment_condition_suitable": {"page": 2, "x": 546, "y": 386, "width": 36, "height": 21, "type": "tri_state"},
    "issuer_checks.firefighting_equipment_available": {"page": 2, "x": 544, "y": 359, "width": 38, "height": 21, "type": "tri_state"},
    "issuer_checks.rescue_equipment_available": {"page": 2, "x": 547, "y": 333, "width": 33, "height": 20, "type": "tri_state"},
    "issuer_checks.equipment_grounded": {"page": 2, "x": 545, "y": 306, "width": 36, "height": 23, "type": "tri_state"},
    "issuer_checks.adequate_lighting": {"page": 2, "x": 542, "y": 278, "width": 40, "height": 22, "type": "tri_state"},
    "issuer_checks.warning_signage_available": {"page": 2, "x": 542, "y": 253, "width": 40, "height": 20, "type": "tri_state"},
    "issuer_checks.conductive_items_removed": {"page": 2, "x": 544, "y": 224, "width": 37, "height": 24, "type": "tri_state"},
    "issuer_checks.safety_requirements_explained": {"page": 2, "x": 543, "y": 188, "width": 38, "height": 31, "type": "tri_state"},
    # Page 3 — People & signatures
    "people.permit_receiver.name": {"page": 3, "x": 194, "y": 626, "width": 147, "height": 20, "type": "text"},
    "people.permit_receiver.signature": {"page": 3, "x": 350, "y": 626, "width": 110, "height": 18, "type": "text"},
    "people.permit_receiver.datetime": {"page": 3, "x": 468, "y": 626, "width": 109, "height": 17, "type": "text"},
    "people.permit_holder.name": {"page": 3, "x": 191, "y": 602, "width": 150, "height": 20, "type": "text"},
    "people.permit_holder.signature": {"page": 3, "x": 347, "y": 601, "width": 117, "height": 21, "type": "text"},
    "people.permit_holder.datetime": {"page": 3, "x": 468, "y": 600, "width": 110, "height": 23, "type": "text"},
    "people.co_workers.1": {"page": 3, "x": 205, "y": 578, "width": 137, "height": 17, "type": "text"},
    "people.co_workers.2": {"page": 3, "x": 359, "y": 577, "width": 103, "height": 17, "type": "text"},
    "people.co_workers.3": {"page": 3, "x": 479, "y": 578, "width": 101, "height": 16, "type": "text"},
    "people.co_workers.4": {"page": 3, "x": 202, "y": 554, "width": 142, "height": 20, "type": "text"},
    "people.co_workers.5": {"page": 3, "x": 358, "y": 554, "width": 103, "height": 19, "type": "text"},
    "people.co_workers.6": {"page": 3, "x": 475, "y": 554, "width": 105, "height": 19, "type": "text"},
    "people.permit_issuer.name": {"page": 3, "x": 193, "y": 509, "width": 148, "height": 17, "type": "text"},
    "people.permit_issuer.signature": {"page": 3, "x": 349, "y": 508, "width": 112, "height": 18, "type": "text"},
    "people.permit_issuer.datetime": {"page": 3, "x": 466, "y": 508, "width": 113, "height": 17, "type": "text"},
    # Page 3 — Extension
    "extension.date": {"page": 3, "x": 28, "y": 415, "width": 76, "height": 19, "type": "text"},
    "extension.time_from": {"page": 3, "x": 107, "y": 416, "width": 31, "height": 15, "type": "text"},
    "extension.time_to": {"page": 3, "x": 143, "y": 416, "width": 38, "height": 15, "type": "text"},
    "extension.permit_holder.name": {"page": 3, "x": 187, "y": 414, "width": 77, "height": 17, "type": "text"},
    "extension.permit_holder.signature": {"page": 3, "x": 271, "y": 415, "width": 45, "height": 16, "type": "text"},
    "extension.permit_receiver.name": {"page": 3, "x": 320, "y": 414, "width": 75, "height": 15, "type": "text"},
    "extension.permit_receiver.signature": {"page": 3, "x": 396, "y": 416, "width": 48, "height": 14, "type": "text"},
    "extension.permit_issuer.name": {"page": 3, "x": 447, "y": 413, "width": 84, "height": 18, "type": "text"},
    "extension.permit_issuer.signature": {"page": 3, "x": 533, "y": 415, "width": 45, "height": 15, "type": "text"},
    "extension.remarks": {"page": 3, "x": 96, "y": 372, "width": 479, "height": 36, "type": "multiline"},
    # Page 3 — Closure
    "closure.permit_receiver.name": {"page": 3, "x": 191, "y": 267, "width": 149, "height": 20, "type": "text"},
    "closure.permit_receiver.signature": {"page": 3, "x": 348, "y": 266, "width": 116, "height": 21, "type": "text"},
    "closure.permit_receiver.datetime": {"page": 3, "x": 468, "y": 266, "width": 111, "height": 20, "type": "text"},
    "closure.permit_holder.name": {"page": 3, "x": 194, "y": 244, "width": 148, "height": 17, "type": "text"},
    "closure.permit_holder.signature": {"page": 3, "x": 349, "y": 244, "width": 113, "height": 15, "type": "text"},
    "closure.permit_holder.datetime": {"page": 3, "x": 466, "y": 244, "width": 113, "height": 17, "type": "text"},
    "closure.permit_issuer.name": {"page": 3, "x": 191, "y": 220, "width": 153, "height": 18, "type": "text"},
    "closure.permit_issuer.signature": {"page": 3, "x": 348, "y": 221, "width": 112, "height": 18, "type": "text"},
    "closure.permit_issuer.datetime": {"page": 3, "x": 466, "y": 220, "width": 114, "height": 19, "type": "text"},
}

_PTW_TAG_SOURCES: dict[str, list[str]] = {
    "meta.permit_no": ["permit_no", "work_order_id"],
    "meta.permit_validity_date": ["permit_validity_date"],
    "meta.start_time": ["start_time"],
    "meta.end_time": ["end_time"],
    "meta.project_site_name": ["project_site_name", "site_name"],
    "meta.work_location": ["work_location"],
    "meta.description_of_work": ["description_of_work", "work_description", "work_description_line1"],
    "meta.contractor_name": ["contractor_name"],
    "hazards.live_dc_cables": ["hz_live_dc_cables"],
    "hazards.loose_or_damaged_connectors": ["hz_loose_connectors"],
    "hazards.moving_solar_tracker_parts": ["hz_tracker_parts"],
    "hazards.dust_accumulation_on_equipment": ["hz_dust"],
    "hazards.high_dc_voltage_from_pv_panels": ["hz_high_dc"],
    "hazards.poor_grounding_earthing": ["hz_poor_grounding"],
    "hazards.heavy_solar_panels": ["hz_heavy_panels"],
    "hazards.wildlife_snakes_insects_birds": ["hz_wildlife"],
    "hazards.arc_flash_short_circuit": ["hz_arc_flash"],
    "hazards.working_at_height_rooftop_structure": ["hz_working_height"],
    "hazards.sharp_panel_edges_metal_structures": ["hz_sharp_edges"],
    "hazards.lightning_or_stormy_weather": ["hz_lightning"],
    "hazards.improper_grounding": ["hz_improper_grounding"],
    "hazards.wet_surfaces": ["hz_wet_surfaces"],
    "hazards.high_ambient_temperature_sun_exposure": ["hz_heat"],
    "hazards.overloaded_circuits": ["hz_overload"],
    "hazards.manual_handling": ["hz_manual_handling"],
    "hazards.overhead_line": ["hz_overhead_line"],
    "hazards.if_others_text": ["hz_others_text"],
    "risks.electrocution": ["rk_electrocution"],
    "risks.burns_equipment_damage": ["rk_burns"],
    "risks.unexpected_energization": ["rk_unexpected_energization"],
    "risks.heat_stress_dehydration": ["rk_heat_stress"],
    "risks.electric_shock": ["rk_electric_shock"],
    "risks.fire_or_overheating": ["rk_fire"],
    "risks.crushing_or_pinching_injuries": ["rk_crushing"],
    "risks.electric_burn": ["rk_electric_burn"],
    "risks.fall_causing_serious_injury": ["rk_fall"],
    "risks.back_or_muscle_injury": ["rk_back_injury"],
    "risks.bites_stings": ["rk_bites"],
    "risks.falling_particles": ["rk_falling_particles"],
    "risks.tripping_slipping": ["rk_tripping"],
    "risks.if_others_text": ["rk_others_text"],
    "ppe.safety_helmet": ["ppe_helmet"],
    "ppe.hrc_suit": ["ppe_hrc_suit"],
    "ppe.respirators": ["ppe_respirators", "ppe_respirator"],
    "ppe.full_body_safety_harness": ["ppe_harness"],
    "ppe.safety_shoes": ["ppe_shoes"],
    "ppe.electrical_mat": ["ppe_electrical_mat"],
    "ppe.dust_masks": ["ppe_dust_mask"],
    "ppe.lifeline_anchor_point": ["ppe_lifeline"],
    "ppe.reflective_vest": ["ppe_reflective_vest"],
    "ppe.face_shield_with_arc_protection": ["ppe_face_shield"],
    "ppe.ear_plugs_muffs": ["ppe_ear_plugs"],
    "ppe.cut_resistant_gloves": ["ppe_cut_gloves"],
    "ppe.safety_goggles": ["ppe_goggles"],
    "ppe.insulated_hand_tools": ["ppe_insulated_tools"],
    "ppe.electrical_hand_gloves": ["ppe_electrical_gloves"],
    "ppe.if_others_text": ["ppe_others_text"],
    "precautions.electrical_isolation": ["sp_electrical_isolation"],
    "precautions.fire_extinguisher_first_aid": ["sp_fire_extinguisher"],
    "precautions.proper_isolation": ["sp_proper_isolation"],
    "precautions.authorized_competent_personnel": ["sp_authorized_personnel"],
    "precautions.lockout_tagout": ["sp_loto"],
    "precautions.warning_signage_barricading": ["sp_signage"],
    "precautions.rescue_equipment_at_site": ["sp_rescue_equipment"],
    "precautions.zero_voltage_ensure": ["sp_zero_voltage"],
    "precautions.proper_earthing_grounding": ["sp_earthing"],
    "precautions.pre_job_meeting": ["sp_pre_job_meeting"],
    "precautions.insulated_tools": ["sp_insulated_tools"],
    "precautions.proper_illumination": ["sp_illumination"],
    "precautions.escape_route_clear": ["sp_escape_route"],
    "precautions.if_others_text": ["sp_others_text"],
    "permits.hot_work_permit_no": ["ap_hot_work"],
    "permits.work_at_night_permit_no": ["ap_night_work"],
    "permits.work_at_height_permit_no": ["ap_height_work"],
    "permits.general_work_permit_no": ["ap_general_work"],
    "permits.excavation_work_permit_no": ["ap_excavation"],
    "permits.lifting_plan_permit_no": ["ap_lifting"],
    "permits.loto_permit_no": ["ap_loto"],
    "permits.confined_space_permit_no": ["ap_confined_space"],
    "permits.if_others_text": ["ap_others_text"],
    "tools_equipment.list_text": ["tools_equipment"],
    "issuer_checks.jsa_carried_out": ["chk_jsa"],
    "issuer_checks.environment_condition_suitable": ["chk_environment"],
    "issuer_checks.equipment_deenergized_loto": ["chk_loto"],
    "issuer_checks.firefighting_equipment_available": ["chk_fire_fighting"],
    "issuer_checks.energized_work_ppe_procedure": ["chk_energized_ppe"],
    "issuer_checks.rescue_equipment_available": ["chk_rescue"],
    "issuer_checks.workers_fit_trained_qualified": ["chk_workers_fit"],
    "issuer_checks.equipment_grounded": ["chk_grounded"],
    "issuer_checks.tools_fit_for_voltage": ["chk_tools"],
    "issuer_checks.adequate_lighting": ["chk_lighting"],
    "issuer_checks.rescue_plan_available": ["chk_rescue_plan"],
    "issuer_checks.warning_signage_available": ["chk_signage"],
    "issuer_checks.testing_equipment_compatible": ["chk_testing_equipment"],
    "issuer_checks.conductive_items_removed": ["chk_conductive_removed"],
    "issuer_checks.line_clearance_taken": ["chk_line_clearance"],
    "issuer_checks.safety_requirements_explained": ["chk_briefing"],
    "people.permit_receiver.name": ["receiver_name"],
    "people.permit_receiver.signature": ["receiver_signature"],
    "people.permit_receiver.datetime": ["receiver_datetime"],
    "people.permit_holder.name": ["permit_holder_name", "holder_name"],
    "people.permit_holder.signature": ["holder_signature"],
    "people.permit_holder.datetime": ["permit_holder_datetime", "holder_datetime"],
    "people.permit_issuer.name": ["permit_issuer_name", "issuer_name"],
    "people.permit_issuer.signature": ["issuer_signature"],
    "people.permit_issuer.datetime": ["permit_issuer_datetime", "issuer_datetime"],
    "people.co_workers.1": ["coworker_1"],
    "people.co_workers.2": ["coworker_2"],
    "people.co_workers.3": ["coworker_3"],
    "people.co_workers.4": ["coworker_4"],
    "people.co_workers.5": ["coworker_5"],
    "people.co_workers.6": ["coworker_6"],
    "extension.date": ["ext_date"],
    "extension.time_from": ["ext_from_time"],
    "extension.time_to": ["ext_to_time"],
    "extension.permit_holder.name": ["ext_holder_name"],
    "extension.permit_holder.signature": ["ext_holder_signature"],
    "extension.permit_receiver.name": ["ext_receiver_name"],
    "extension.permit_receiver.signature": ["ext_receiver_signature"],
    "extension.permit_issuer.name": ["ext_issuer_name"],
    "extension.permit_issuer.signature": ["ext_issuer_signature"],
    "extension.remarks": ["ext_remarks"],
    "closure.permit_receiver.name": ["closure_receiver"],
    "closure.permit_receiver.signature": ["closure_receiver_signature"],
    "closure.permit_receiver.datetime": ["closure_receiver_datetime"],
    "closure.permit_holder.name": ["closure_holder"],
    "closure.permit_holder.signature": ["closure_holder_signature"],
    "closure.permit_holder.datetime": ["closure_holder_datetime"],
    "closure.permit_issuer.name": ["closure_issuer"],
    "closure.permit_issuer.signature": ["closure_issuer_signature"],
    "closure.permit_issuer.datetime": ["closure_issuer_datetime"],
}

_APPROVED_STAMP_X = 374
_APPROVED_STAMP_Y = 790
_APPROVED_STAMP_DATE_Y = 772


# ---------------------------------------------------------------------------
# Overlay rendering helpers (verbatim from S1.py)
# ---------------------------------------------------------------------------

def _is_truthy(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().upper() in {"Y", "YES", "TRUE", "1", "✓", "✔"}
    return bool(val)


def _prepare_overlay_data(form_data: dict) -> dict:
    fd = form_data if isinstance(form_data, dict) else {}
    out: dict[str, Any] = {}
    for tag in PTW_PDF_COORDINATES.keys():
        sources = _PTW_TAG_SOURCES.get(tag, [])
        val = None
        for k in sources:
            if k in fd:
                val = fd.get(k)
                break
        out[tag] = val
    return out


def _ptw_wrap_text_to_width(
    text: str, *, font_name: str, font_size: int, max_width: float
) -> list[str]:
    try:
        from reportlab.pdfbase import pdfmetrics
    except Exception:
        import textwrap
        return textwrap.wrap(text, width=max(1, int(max_width // 5))) or [text]

    words = (text or "").replace("\r", " ").split()
    if not words:
        return []
    lines: list[str] = []
    cur = words[0]
    for w in words[1:]:
        candidate = f"{cur} {w}"
        if pdfmetrics.stringWidth(candidate, font_name, font_size) <= max_width:
            cur = candidate
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def _ptw_draw_centered_text(
    canvas_obj: Any,
    *,
    x: float, y: float, w: float, h: float,
    text: str,
    font_name: str = "Helvetica-Bold",
    font_size: int = 10,
) -> None:
    try:
        from reportlab.pdfbase import pdfmetrics
        tw = float(pdfmetrics.stringWidth(text, font_name, font_size))
    except Exception:
        tw = float(len(text) * (font_size * 0.6))
    tx = float(x) + max(0.0, (float(w) - tw) / 2.0)
    ty = float(y) + max(0.0, (float(h) - float(font_size)) / 2.0)
    canvas_obj.setFont(font_name, font_size)
    canvas_obj.drawString(tx, ty, text)


def _ptw_draw_text_in_box(
    canvas_obj: Any,
    *,
    x: float, y: float, w: float, h: float,
    text: str,
    multiline: bool,
    font_name: str = "Helvetica",
    font_size: int = 9,
) -> None:
    s = ("" if text is None else str(text)).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not s:
        return
    canvas_obj.setFont(font_name, font_size)
    if multiline:
        lines: list[str] = []
        for para in s.split("\n"):
            para = para.strip()
            if not para:
                lines.append("")
                continue
            lines.extend(
                _ptw_wrap_text_to_width(para, font_name=font_name, font_size=font_size, max_width=float(w))
            )
        line_h = float(font_size) + 1.0
        max_lines = max(1, int(float(h) // line_h))
        lines = lines[:max_lines]
        y_top = float(y) + float(h) - float(font_size)
        for i, line in enumerate(lines):
            yy = y_top - (i * line_h)
            if yy < float(y):
                break
            canvas_obj.drawString(float(x), yy, line)
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        if pdfmetrics.stringWidth(s, font_name, font_size) > float(w):
            ell = "…"
            while s and pdfmetrics.stringWidth(s + ell, font_name, font_size) > float(w):
                s = s[:-1]
            s = (s + ell) if s else ""
    except Exception:
        max_chars = max(1, int(float(w) // (font_size * 0.6)))
        if len(s) > max_chars:
            s = s[: max(1, max_chars - 1)] + "…"
    yy = float(y) + max(1.0, (float(h) - float(font_size)) / 2.0)
    canvas_obj.drawString(float(x), yy, s)


def _render_ptw_overlay_page(canvas_obj: Any, *, page_num: int, data: dict) -> None:
    for tag, cfg in PTW_PDF_COORDINATES.items():
        if int(cfg.get("page", 0)) != int(page_num):
            continue
        v = (data or {}).get(tag)
        if v is None:
            continue
        x = float(cfg.get("x", 0))
        y = float(cfg.get("y", 0))
        w = float(cfg.get("width", 0))
        h = float(cfg.get("height", 0))
        typ = str(cfg.get("type") or "text").strip().lower()
        if typ == "checkbox":
            if _is_truthy(v):
                fs = max(8, min(14, int(h) + 2))
                _ptw_draw_centered_text(canvas_obj, x=x, y=y, w=w, h=h, text="✓", font_name="Helvetica-Bold", font_size=fs)
            continue
        if typ == "tri_state":
            s = str(v).strip().upper()
            if s in {"Y", "N", "NA"}:
                _ptw_draw_centered_text(canvas_obj, x=x, y=y, w=w, h=h, text=s, font_name="Helvetica-Bold", font_size=9)
            continue
        if typ == "multiline":
            _ptw_draw_text_in_box(canvas_obj, x=x, y=y, w=w, h=h, text=str(v), multiline=True, font_name="Helvetica", font_size=8)
            continue
        _ptw_draw_text_in_box(canvas_obj, x=x, y=y, w=w, h=h, text=str(v), multiline=False, font_name="Helvetica", font_size=9)


def _draw_approved_stamp(canvas_obj: Any, approved_datetime: Any) -> None:
    canvas_obj.setFont("Helvetica-Bold", 16)
    canvas_obj.setFillColorRGB(0, 0.6, 0)
    canvas_obj.drawString(_APPROVED_STAMP_X, _APPROVED_STAMP_Y, "APPROVED")
    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.setFillColorRGB(0, 0, 0)
    canvas_obj.drawString(
        _APPROVED_STAMP_X,
        _APPROVED_STAMP_DATE_Y,
        f"Date: {'' if approved_datetime is None else str(approved_datetime)}",
    )


# ---------------------------------------------------------------------------
# generate_ptw_pdf_from_template (verbatim from S1.py)
# ---------------------------------------------------------------------------

def generate_ptw_pdf_from_template(
    form_data: dict, *, progress_callback: Optional[Callable] = None
) -> bytes:
    """
    Generate PTW PDF using PDF template + ReportLab overlay.
    Verbatim logic from S1.generate_ptw_pdf_from_template.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as rl_canvas
    from PyPDF2 import PdfReader, PdfWriter

    if progress_callback:
        try:
            progress_callback(5, "Downloading PDF template...")
        except Exception:
            pass

    template_bytes = _download_pdf_template_from_supabase()

    if progress_callback:
        try:
            progress_callback(20, "Preparing form data...")
        except Exception:
            pass

    data = _prepare_overlay_data(form_data)
    template_reader = PdfReader(BytesIO(template_bytes))
    num_pages = len(template_reader.pages)

    if progress_callback:
        try:
            progress_callback(30, "Creating overlay...")
        except Exception:
            pass

    overlay_buffer = BytesIO()
    c = rl_canvas.Canvas(overlay_buffer, pagesize=A4)

    for page_idx in range(num_pages):
        _render_ptw_overlay_page(c, page_num=page_idx + 1, data=data)
        if (
            page_idx == 0
            and str(form_data.get("status", "")).strip().upper() == "APPROVED"
        ):
            _draw_approved_stamp(c, form_data.get("date_s3_approved"))
        c.showPage()

    c.save()
    overlay_buffer.seek(0)

    if progress_callback:
        try:
            progress_callback(60, "Merging PDF layers...")
        except Exception:
            pass

    overlay_reader = PdfReader(overlay_buffer)
    writer = PdfWriter()

    for page_idx in range(num_pages):
        template_page = template_reader.pages[page_idx]
        if page_idx < len(overlay_reader.pages):
            overlay_page = overlay_reader.pages[page_idx]
            template_page.merge_page(overlay_page)
        writer.add_page(template_page)

    if progress_callback:
        try:
            progress_callback(90, "Finalizing PDF...")
        except Exception:
            pass

    output_buffer = BytesIO()
    writer.write(output_buffer)
    output_buffer.seek(0)
    pdf_bytes = output_buffer.read()

    if not pdf_bytes or pdf_bytes[:4] != b"%PDF":
        raise RuntimeError("PDF generation failed: output is not a valid PDF")

    if progress_callback:
        try:
            progress_callback(100, "PDF ready!")
        except Exception:
            pass

    return pdf_bytes
