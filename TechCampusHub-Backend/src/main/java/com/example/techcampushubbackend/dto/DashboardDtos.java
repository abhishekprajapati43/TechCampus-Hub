package com.example.techcampushubbackend.dto;

/**
 * Dashboard summary payloads. One response carries every availability
 * count the student dashboard cards need, so the page renders with a
 * single request.
 */
public final class DashboardDtos {

    private DashboardDtos() {
    }

    /**
     * Availability counts for the signed-in student: free resources plus
     * resources of course bundles they hold an approved, unexpired
     * purchase of. Locked, hidden, deleted, draft and expired material
     * is never counted.
     */
    public record DashboardSummary(
            long notes,
            long tnp,
            long pyq,
            long timetable,
            long syllabus
    ) {
    }
}
