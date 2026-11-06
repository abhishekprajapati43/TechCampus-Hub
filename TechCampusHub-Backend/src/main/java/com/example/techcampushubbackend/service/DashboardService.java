package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.DashboardDtos.DashboardSummary;
import com.example.techcampushubbackend.entity.Role;
import com.example.techcampushubbackend.entity.User;
import com.example.techcampushubbackend.repository.NoteRepository;
import com.example.techcampushubbackend.repository.PurchaseRepository;
import com.example.techcampushubbackend.repository.PyqRepository;
import com.example.techcampushubbackend.repository.SyllabusRepository;
import com.example.techcampushubbackend.repository.TimetableRepository;
import com.example.techcampushubbackend.repository.TnpNoteRepository;
import com.example.techcampushubbackend.utils.CurrentUserService;
import com.example.techcampushubbackend.utils.ProgramFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Single dashboard summary for the signed-in student.
 *
 * <p>The four cards (Notes / TNP / PYQ / Exam Timetable) all read from one
 * response, so the dashboard renders with a single request. Every count is
 * availability, not a raw row count: free resources plus resources of course
 * bundles the student holds an approved, unexpired purchase of. Locked,
 * hidden, deleted, draft and expired material is never counted.
 *
 * <p>The counting rule is the same access model the rest of the app enforces
 * when opening a document, so the number on a card always matches what the
 * student can actually reach in that section. Notes, PYQ and timetable
 * counts are additionally scoped to the student's program (MCA vs B.Tech vs
 * BCA); TNP stays shared across every program.
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final NoteRepository noteRepository;
    private final TnpNoteRepository tnpNoteRepository;
    private final PyqRepository pyqRepository;
    private final TimetableRepository timetableRepository;
    private final SyllabusRepository syllabusRepository;
    private final PurchaseRepository purchaseRepository;
    private final CurrentUserService currentUserService;

    /** Availability counts for the caller's dashboard cards. */
    @Transactional(readOnly = true)
    public DashboardSummary summary() {
        User user = currentUserService.requireUser();

        // Staff see everything the app would list for them; students are
        // scoped to free content plus their active purchases.
        if (user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY) {
            return new DashboardSummary(
                    noteRepository.count(),
                    tnpNoteRepository.count(),
                    pyqRepository.count(),
                    timetableRepository.count(),
                    syllabusRepository.count());
        }

        List<Long> courseIds = accessibleCourseIds(user.getId());

        return new DashboardSummary(
                // Notes are scoped to the student's program just like
                // PYQs/timetables, so the card count always matches
                // what the Notes page lists.
                countNotes(user, courseIds),
                tnpNoteRepository.countAccessible(courseIds),
                // PYQ/timetable are additionally scoped to the student's
                // program (MCA vs B.Tech vs BCA), matching what their
                // pages list.
                countPyqs(user, courseIds),
                countTimetables(user, courseIds),
                countSyllabus(user, courseIds));
    }

    /**
     * Notes this student can reach: free/own-bundle notes of their program.
     * Counted in Java because the program comparison normalises labels
     * ("B.Tech" vs "BTech"); the tables are small and the notes page loads
     * them all anyway, so the card number always matches the page.
     */
    private long countNotes(User user, List<Long> courseIds) {
        return noteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> note.getCourseBundle() == null
                        || courseIds.contains(note.getCourseBundle().getId()))
                .filter(note -> ProgramFilter.matches(note.getCourse(), user.getCourse()))
                .count();
    }

    /**
     * PYQs this student can reach: free/own-bundle papers of their program.
     * Counted in Java because the program comparison normalises labels
     * ("B.Tech" vs "BTech"); the tables are small and the PYQ page loads
     * them all anyway, so the card number always matches the page.
     */
    private long countPyqs(User user, List<Long> courseIds) {
        return pyqRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(pyq -> pyq.getCourseBundle() == null
                        || courseIds.contains(pyq.getCourseBundle().getId()))
                .filter(pyq -> ProgramFilter.matches(pyq.getCourse(), user.getCourse()))
                .count();
    }

    /** Same availability rule as {@link #countPyqs}, for timetables. */
    private long countTimetables(User user, List<Long> courseIds) {
        return timetableRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(t -> t.getCourseBundle() == null
                        || courseIds.contains(t.getCourseBundle().getId()))
                .filter(t -> ProgramFilter.matches(t.getCourse(), user.getCourse()))
                .count();
    }

    /** Active syllabus of the student's program and accessible bundles. */
    private long countSyllabus(User user, List<Long> courseIds) {
        return syllabusRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(row -> row.isActive())
                .filter(row -> row.getCourseBundle() == null
                        || courseIds.contains(row.getCourseBundle().getId()))
                .filter(row -> ProgramFilter.matches(row.getCourse(), user.getCourse()))
                .count();
    }

    /**
     * Course bundle ids this student may open right now: an approved purchase
     * whose validity window has not expired. An empty list keeps the SQL
     * {@code IN} clause valid and reduces it to free content only.
     */
    private List<Long> accessibleCourseIds(Long userId) {
        List<Long> courseIds = purchaseRepository
                .findActiveByUser(userId, LocalDateTime.now()).stream()
                .map(purchase -> purchase.getCourse().getId())
                .distinct()
                .toList();

        return courseIds.isEmpty() ? List.of(-1L) : courseIds;
    }
}
