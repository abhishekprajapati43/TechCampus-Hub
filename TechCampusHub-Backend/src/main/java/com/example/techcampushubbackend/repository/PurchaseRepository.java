package com.example.techcampushubbackend.repository;

import com.example.techcampushubbackend.entity.Purchase;
import com.example.techcampushubbackend.entity.PurchaseStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Repository
public interface PurchaseRepository extends JpaRepository<Purchase, Long> {

    List<Purchase> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * Distinct course ids the student holds a pending or approved purchase of.
     * Drives the 1+1 second-course offer: rejected rows never count, and
     * pending rows count so several discounted requests can never stack
     * while earlier ones await admin review.
     */
    @Query("select distinct p.course.id from Purchase p where p.user.id = :userId "
            + "and p.status in :statuses")
    List<Long> findCourseIdsByUserAndStatusIn(@Param("userId") Long userId,
            @Param("statuses") Collection<PurchaseStatus> statuses);

    List<Purchase> findByStatusOrderByCreatedAtDesc(PurchaseStatus status);

    List<Purchase> findAllByOrderByCreatedAtDesc();

    boolean existsByUserIdAndCourseIdAndStatus(Long userId, Long courseId, PurchaseStatus status);

    /**
     * An approved purchase whose validity window has not expired yet.
     *
     * <p>{@code validUntil == null} is treated as lifetime access: the
     * frontend already renders a missing expiry as "Lifetime Access", so the
     * server must agree or an approved lifetime purchase would unlock nothing.
     * </p>
     */
    @Query("select case when count(p) > 0 then true else false end from Purchase p "
            + "where p.user.id = :userId and p.course.id = :courseId "
            + "and p.status = :status "
            + "and (p.validUntil is null or p.validUntil > :now)")
    boolean existsByUserIdAndCourseIdAndStatusAndValidUntilAfter(
            @Param("userId") Long userId,
            @Param("courseId") Long courseId,
            @Param("status") PurchaseStatus status,
            @Param("now") LocalDateTime now);

    @Query("select p from Purchase p where p.user.id = :userId and p.status = 'APPROVED' "
            + "and (p.validUntil is null or p.validUntil > :now) "
            + "order by p.validUntil desc")
    List<Purchase> findActiveByUser(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * Every purchase of a faculty member's courses (any status), newest first.
     * Powers the faculty dashboard "Recent Purchases" card and the scoped
     * Users table - faculty can never see purchases of other people's courses.
     */
    @Query("select p from Purchase p join p.course c where c.createdBy = :facultyId "
            + "order by p.createdAt desc")
    List<Purchase> findFacultyPurchases(@Param("facultyId") Long facultyId);

    /** Distinct students holding any purchase of a faculty member's courses. */
    @Query("select count(distinct p.user.id) from Purchase p join p.course c "
            + "where c.createdBy = :facultyId")
    long countDistinctStudentsByFaculty(@Param("facultyId") Long facultyId);

    /** True while the user holds at least one approved, unexpired purchase. */
    @Query("select case when count(p) > 0 then true else false end from Purchase p "
            + "where p.user.id = :userId and p.status = :status "
            + "and (p.validUntil is null or p.validUntil > :now)")
    boolean existsByUserIdAndStatusAndValidUntilAfter(
            @Param("userId") Long userId,
            @Param("status") PurchaseStatus status,
            @Param("now") LocalDateTime now);

    // ------------------------------------------------------------- deletion

    long deleteByUserId(Long userId);

    /** Clears the reviewer credit a deleted user left on other students' rows. */
    @Modifying
    @Query("update Purchase p set p.reviewedBy = null where p.reviewedBy.id = :userId")
    void clearReviewedBy(@Param("userId") Long userId);
}
