package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.HomeResourceDtos.HomeResourcePreview;
import com.example.techcampushubbackend.dto.HomeResourceDtos.HomeResourcesResponse;
import com.example.techcampushubbackend.entity.Note;
import com.example.techcampushubbackend.entity.Pyq;
import com.example.techcampushubbackend.entity.Syllabus;
import com.example.techcampushubbackend.entity.TnpNote;
import com.example.techcampushubbackend.repository.NoteRepository;
import com.example.techcampushubbackend.repository.PyqRepository;
import com.example.techcampushubbackend.repository.SyllabusRepository;
import com.example.techcampushubbackend.repository.TnpNoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.example.techcampushubbackend.utils.ContentUtils.resolveTitle;

/**
 * Homepage previews for the public storefront.
 *
 * <p>Only the newest metadata of each collection is returned - never the
 * storage URL, storage path or bundle-only description. Login (and, for
 * bundle-linked rows, a purchase) is still enforced by the authenticated
 * viewer relay, so this endpoint cannot be used to read a document.</p>
 */
@Service
@RequiredArgsConstructor
public class HomeResourceService {

    /** Keeps the homepage payload small even if a caller asks for more. */
    private static final int MAX_LIMIT = 12;

    private final NoteRepository noteRepository;
    private final PyqRepository pyqRepository;
    private final TnpNoteRepository tnpNoteRepository;
    private final SyllabusRepository syllabusRepository;

    @Transactional(readOnly = true)
    public HomeResourcesResponse latest(int limit) {
        int size = Math.max(1, Math.min(limit, MAX_LIMIT));

        List<HomeResourcePreview> notes = noteRepository
                .findAllByOrderByCreatedAtDesc().stream()
                .limit(size)
                .map(HomeResourceService::notePreview)
                .toList();

        List<HomeResourcePreview> pyq = pyqRepository
                .findAllByOrderByCreatedAtDesc().stream()
                .limit(size)
                .map(HomeResourceService::pyqPreview)
                .toList();

        List<HomeResourcePreview> tnp = tnpNoteRepository
                .findAllByOrderByCreatedAtDesc().stream()
                .limit(size)
                .map(HomeResourceService::tnpPreview)
                .toList();

        List<HomeResourcePreview> syllabus = syllabusRepository
                .findAllByOrderByCreatedAtDesc().stream()
                .filter(Syllabus::isActive)
                .limit(size)
                .map(HomeResourceService::syllabusPreview)
                .toList();

        return new HomeResourcesResponse(notes, pyq, tnp, syllabus);
    }

    private static HomeResourcePreview notePreview(Note note) {
        boolean locked = note.getCourseBundle() != null;
        return new HomeResourcePreview(
                note.getId(),
                "notes",
                resolveTitle(note.getTitle(), note.getSubject(), note.getCourse()),
                note.getCourse(),
                note.getSemester(),
                note.getSubject(),
                locked ? null : note.getDescription(),
                note.getCreatedAt(),
                locked);
    }

    private static HomeResourcePreview pyqPreview(Pyq pyq) {
        boolean locked = pyq.getCourseBundle() != null;
        return new HomeResourcePreview(
                pyq.getId(),
                "pyq",
                resolveTitle(pyq.getTitle(), pyq.getSubject(), pyq.getCourse()),
                pyq.getCourse(),
                pyq.getSemester(),
                pyq.getSubject(),
                locked ? null : pyq.getDescription(),
                pyq.getCreatedAt(),
                locked);
    }

    private static HomeResourcePreview tnpPreview(TnpNote tnp) {
        boolean locked = tnp.getCourseBundle() != null;
        return new HomeResourcePreview(
                tnp.getId(),
                "tnp",
                resolveTitle(tnp.getTitle(), tnp.getTopic()),
                locked ? tnp.getCourseBundle().getTitle() : "All Programs",
                null,
                tnp.getTopic(),
                locked ? null : tnp.getDescription(),
                tnp.getCreatedAt(),
                locked);
    }

    private static HomeResourcePreview syllabusPreview(Syllabus syllabus) {
        boolean locked = syllabus.getCourseBundle() != null;
        return new HomeResourcePreview(
                syllabus.getId(),
                "syllabus",
                resolveTitle(syllabus.getTitle(), syllabus.getCourse()),
                syllabus.getCourse(),
                syllabus.getSemester(),
                null,
                null,
                syllabus.getCreatedAt(),
                locked);
    }
}
