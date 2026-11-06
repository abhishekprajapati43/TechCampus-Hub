package com.example.techcampushubbackend.repository;

import com.example.techcampushubbackend.entity.Syllabus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SyllabusRepository extends JpaRepository<Syllabus, Long> {

    List<Syllabus> findAllByOrderByCreatedAtDesc();

    /** Content uploaded by one faculty member (dashboard counts). */
    long countByCreatedBy(Long createdBy);
}
