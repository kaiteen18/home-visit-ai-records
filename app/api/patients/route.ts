import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/get-organization-id";

const PATIENTS_LIST_SELECT = "id, patient_name" as const;

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, organizationId } = auth;

    const { data, error } = await supabase
      .from("patients")
      .select(PATIENTS_LIST_SELECT)
      .eq("organization_id", organizationId)
      .order("patient_name", { ascending: true });

    if (error) {
      console.error("[api/patients GET] Supabase select error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });

      return NextResponse.json(
        { error: `患者一覧の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      patients: data ?? [],
    });
  } catch (err) {
    console.error("[api/patients GET] unexpected error:", {
      name: err instanceof Error ? err.name : "Unknown",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      cause: err instanceof Error ? err.cause : undefined,
    });

    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
