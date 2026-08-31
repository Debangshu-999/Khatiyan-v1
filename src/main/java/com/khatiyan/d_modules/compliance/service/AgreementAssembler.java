package com.khatiyan.d_modules.compliance.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.model.AgreementClause;
import com.khatiyan.d_modules.compliance.model.AgreementTemplate;
import com.khatiyan.d_modules.compliance.model.CustomClauseSpec;
import com.khatiyan.d_modules.compliance.model.MainClauseType;
import com.khatiyan.d_modules.compliance.model.MiscClauseType;

/**
 * Turns a template and a set of facts into the finished, numbered deed.
 *
 * <p>Three jobs and no others: decide which clauses survive, put them in order,
 * and number them. The words belong to {@link MainClauseTemplates} and
 * {@link MiscClauseType}; this class never writes prose, which is what keeps
 * "which clauses appear" reviewable separately from "what they say".
 *
 * <p>Order is always: the surviving main run with custom clauses spliced into it,
 * then the miscellaneous clauses as their own section, numbered from 1 again.
 * Miscellaneous are never interleaved — a term the owner opted into is not one of
 * the terms the deed is built from.
 */
@Component
public class AgreementAssembler {

    private final MainClauseTemplates templates;

    public AgreementAssembler(MainClauseTemplates templates) {
        this.templates = templates;
    }

    /**
     * The finished deed, as two independently numbered sections.
     *
     * <p>The main run — surviving main clauses with custom ones spliced in —
     * numbers 1..n. The miscellaneous clauses then start again at 1 under their
     * own heading, as the reference deed does.
     *
     * <p>They are a separate section rather than a continuation because they are a
     * different KIND of term: the main run is what this agreement is built from,
     * and the miscellaneous clauses are options the owner added on top. Numbering
     * them 16, 17 would present them as equal parts of the same instrument.
     *
     * <p>{@code displayOrder} is therefore the clause's number WITHIN ITS SECTION,
     * not its position in the document. A reader groups by
     * {@link AgreementClause#getKind()} and renders each section's own sequence.
     */
    public List<AgreementClause> assemble(AgreementTemplate template, DeedFacts facts) {
        List<AgreementClause> mainRun = surviving(template, facts);
        List<AgreementClause> ordered = splice(mainRun, template.customClauses());

        // Numbered once, over the finished main run. Numbering as we go would have
        // to be redone by every splice, and the number a clause carries is the one
        // printed on the signed document.
        for (int at = 0; at < ordered.size(); at += 1) {
            ordered.get(at).setDisplayOrder(at + 1);
        }

        int miscNumber = 1;
        for (MiscClauseType misc : template.miscClauses()) {
            ordered.add(AgreementClause.misc(misc, miscNumber));
            miscNumber += 1;
        }
        return ordered;
    }

    /**
     * The main clauses that actually appear.
     *
     * <p>Two independent reasons one may not: the owner EXCLUDED it, which is a
     * stored choice they can undo, or the facts make it VACUOUS — the
     * deposit-payment clause with no deposit — which is decided here and is not
     * offered back, because there is nothing to restore.
     */
    private List<AgreementClause> surviving(AgreementTemplate template, DeedFacts facts) {
        List<AgreementClause> clauses = new ArrayList<>();
        for (MainClauseType type : MainClauseType.values()) {
            if (!template.includes(type)) {
                continue;
            }
            Optional<AgreementClause> rendered = templates.render(type, facts, 0);
            rendered.ifPresent(clauses::add);
        }
        return clauses;
    }

    /**
     * Places each custom clause at its requested position in the main run.
     *
     * <p>Positions are 1-based against the SURVIVING list and are read against the
     * list as it was before any splicing — so two custom clauses do not shift each
     * other, and dropping a main clause cannot orphan one. A position past the end
     * lands after the whole main run, which is also where a clause written for a
     * slot that no longer exists ends up rather than being lost.
     *
     * <p>Ties keep their stored order: two clauses both asking for position four
     * appear at four and five, in the order the owner wrote them.
     */
    private List<AgreementClause> splice(List<AgreementClause> mainRun, List<CustomClauseSpec> customClauses) {
        List<CustomClauseSpec> sorted = new ArrayList<>(customClauses);
        sorted.sort(Comparator.comparingInt(spec -> Math.max(1, spec.position())));

        List<AgreementClause> result = new ArrayList<>();
        int nextCustom = 0;

        for (int slot = 1; slot <= mainRun.size(); slot += 1) {
            while (nextCustom < sorted.size() && Math.max(1, sorted.get(nextCustom).position()) <= slot) {
                result.add(toClause(sorted.get(nextCustom)));
                nextCustom += 1;
            }
            result.add(mainRun.get(slot - 1));
        }

        while (nextCustom < sorted.size()) {
            result.add(toClause(sorted.get(nextCustom)));
            nextCustom += 1;
        }
        return result;
    }

    private static AgreementClause toClause(CustomClauseSpec spec) {
        return AgreementClause.custom(spec.heading(), spec.body(), 0);
    }
}
