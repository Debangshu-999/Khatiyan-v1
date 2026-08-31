package com.khatiyan.d_modules.compliance.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.compliance.model.AgreementPreamble;
import com.khatiyan.d_modules.compliance.model.ClauseParagraph;
import com.khatiyan.d_modules.compliance.model.ClauseSegment;
import com.khatiyan.d_modules.compliance.model.PartyBlock;

/**
 * The head of the deed: title, execution line, both parties, and the recitals.
 *
 * <h2>Why the instrument is still a Leave and License</h2>
 *
 * <p>The parties are named Landlord and Tenant, in plain words. The DOCUMENT is
 * still a leave and license, because that is what gives the no-tenancy clause its
 * force: a paper titled "Tenancy Agreement" whose seventh clause denies tenancy
 * rights argues against itself.
 *
 * <h2>The Landlord is always the property's owner</h2>
 *
 * <p>Never the manager who ran the onboarding. A manager acts for the owner; they
 * are not a party to the agreement, and printing them as one would name someone
 * with no title to the premises as the person granting the licence.
 */
@Component
public class PreambleTemplate {

    private static final DateTimeFormatter LONG_DATE = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH);

    private static final String TITLE = "LEAVE AND LICENSE AGREEMENT";

    public AgreementPreamble render(
            PartyDetails landlord,
            PartyDetails tenant,
            PremisesDetails premises,
            DeedFacts facts,
            LocalDate executionDate) {

        return new AgreementPreamble(
                TITLE,
                List.of(execution(executionDate, premises)),
                party("BETWEEN", "Landlord", landlord, "Landlord's Name", true),
                party("AND", "Tenant", tenant, "Tenant's Name", false),
                recitals(premises, facts));
    }

    /**
     * When and where.
     *
     * <p>The date is a placeholder until the tenant actually signs. Executing a
     * deed is something that HAPPENS, and stamping today's date on an unsigned
     * draft would date it to whenever somebody last opened the screen.
     */
    private ClauseParagraph execution(LocalDate executionDate, PremisesDetails premises) {
        return ClauseParagraph.of(
                ClauseSegment.plain("This agreement is made and executed on "),
                executionDate != null
                        ? ClauseSegment.marked(executionDate.format(LONG_DATE))
                        : ClauseSegment.placeholder("Execution Date"),
                ClauseSegment.plain(" at "),
                text(premises.city(), "City"));
    }

    private PartyBlock party(
            String heading,
            String role,
            PartyDetails party,
            String nameLabel,
            boolean withEmail) {
        List<ClauseParagraph> body = new ArrayList<>();
        List<ClauseSegment> line = new ArrayList<>();

        line.add(ClauseSegment.plain("Name: "));
        line.add(party.known() ? ClauseSegment.marked(party.name()) : ClauseSegment.placeholder(nameLabel));

        // Age and gender are optional on a profile, so a known party simply omits
        // them when absent. An unknown party still shows both, because the point
        // of the template is to say what onboarding will ask for.
        if (!party.known() || party.age() != null) {
            line.add(ClauseSegment.plain(" Age: "));
            line.add(party.known() ? ClauseSegment.marked(String.valueOf(party.age())) : ClauseSegment.placeholder("Age"));
            line.add(ClauseSegment.plain(" Years,"));
        } else {
            line.add(ClauseSegment.plain(","));
        }

        if (!party.known() || party.gender() != null) {
            line.add(ClauseSegment.plain(" "));
            line.add(party.known() ? ClauseSegment.marked(party.gender()) : ClauseSegment.placeholder("Gender"));
            line.add(ClauseSegment.plain(","));
        }

        line.add(ClauseSegment.plain(" Phone: "));
        line.add(text(party.known() ? party.phone() : null, "Phone no"));

        // The LANDLORD's email is printed, the TENANT's is not.
        //
        // Not an oversight and not asymmetry for its own sake. A deed is fixed
        // at signing but an account is not: a tenant who changes their email
        // afterwards leaves the document asserting an address that no longer
        // reaches them, and a contract that quietly says something untrue is
        // worse than one that never said it. The landlord's survives that
        // objection because it has to be VERIFIED before onboarding can even
        // start (see User.hasAgreementIdentity), so it is a proved contact
        // rather than a value somebody typed into a form.
        //
        // The tenant is reachable by the phone number above, which is the
        // number they authenticate with.
        if (withEmail) {
            line.add(ClauseSegment.plain(", Email: "));
            line.add(text(party.known() ? party.email() : null, "Email"));
        }

        line.add(ClauseSegment.plain(", residing at "));
        line.add(text(party.known() ? party.permanentAddress() : null, "Permanent Address"));
        line.add(ClauseSegment.plain(", "));
        line.add(text(party.known() ? party.pincode() : null, "PIN Code"));
        line.add(ClauseSegment.plain("."));

        body.add(new ClauseParagraph(false, line));
        body.add(ClauseParagraph.text("Hereinafter referred to as the \"" + role + "\" (which expression shall mean"
                + " and include the " + role + " above named and also their respective heirs, successors, assigns,"
                + " executors and administrators)."));

        return new PartyBlock(heading, role, body);
    }

    private List<ClauseParagraph> recitals(PremisesDetails premises, DeedFacts facts) {
        List<ClauseParagraph> recitals = new ArrayList<>();

        List<ClauseSegment> premisesLine = new ArrayList<>();
        premisesLine.add(ClauseSegment.plain("WHEREAS the Landlord is the lawful and legal owner and is fully"
                + " seized and possessed of the premises known as "));
        premisesLine.add(text(premises.propertyName(), "Property Name"));
        premisesLine.add(ClauseSegment.plain(", situated at "));
        premisesLine.add(text(premises.address(), "Address"));
        premisesLine.add(ClauseSegment.plain(", "));
        premisesLine.add(text(premises.area(), "Locality"));
        premisesLine.add(ClauseSegment.plain(", "));
        premisesLine.add(text(premises.city(), "City"));
        premisesLine.add(ClauseSegment.plain(", "));
        premisesLine.add(text(premises.state(), "State"));
        premisesLine.add(ClauseSegment.plain(", "));
        premisesLine.add(text(premises.pincode(), "Pin Code"));
        premisesLine.add(ClauseSegment.plain("."));
        recitals.add(new ClauseParagraph(false, premisesLine));

        // The licensed thing is a BED in a room, not the building. Saying so here
        // is what keeps the rest of the deed honest: every clause about "the
        // Premises" is about that accommodation, and a recital that described the
        // whole property would promise the tenant far more than they are renting.
        List<ClauseSegment> roomLine = new ArrayList<>();
        roomLine.add(ClauseSegment.plain("The accommodation licensed under this agreement is Room "));
        roomLine.add(text(premises.roomNumber(), "Room Number"));
        roomLine.add(ClauseSegment.plain(", a "));
        roomLine.add(text(premises.sharingLabel(), "Room Type"));
        roomLine.add(ClauseSegment.plain(" room therein, hereinafter referred to as the Premises."));
        recitals.add(new ClauseParagraph(false, roomLine));

        List<ClauseSegment> requestLine = new ArrayList<>();
        requestLine.add(ClauseSegment.plain("AND WHEREAS the Tenant has approached the Landlord with a request to"
                + " occupy the said Premises for residential use "));
        if (facts.isFixedTerm()) {
            requestLine.add(ClauseSegment.plain("for a period of "));
            // Resolved even on a property template. The term is the one fact on
            // that screen the owner HAS set — the dates around it depend on a
            // start date nobody has chosen yet, but the length does not.
            requestLine.add(ClauseSegment.marked(
                    facts.validityMonths() + (facts.validityMonths() == 1 ? " month" : " months")));
            requestLine.add(ClauseSegment.plain(" commencing from "));
        } else {
            requestLine.add(ClauseSegment.plain("commencing from "));
        }
        requestLine.add(facts.unresolved()
                ? ClauseSegment.placeholder("Start Date")
                : ClauseSegment.marked(facts.startDate().format(LONG_DATE)));
        // The recital states both ends of a fixed term, as the reference deed
        // does. Naming only the start would leave the one date a reader most wants
        // to check to a clause further down the page.
        if (facts.isFixedTerm()) {
            requestLine.add(ClauseSegment.plain(" and ending on "));
            requestLine.add(facts.unresolved()
                    ? ClauseSegment.placeholder("End Date")
                    : ClauseSegment.marked(facts.agreementEndDate().format(LONG_DATE)));
        }
        requestLine.add(ClauseSegment.plain(", on terms and subject to conditions hereafter appearing."));
        recitals.add(new ClauseParagraph(false, requestLine));

        recitals.add(ClauseParagraph.text("Now it is agreed by and between the parties hereto as follows:"));
        return recitals;
    }

    /** A value, or its field name when we do not have one. */
    private static ClauseSegment text(String value, String label) {
        return value == null || value.isBlank()
                ? ClauseSegment.placeholder(label)
                : ClauseSegment.marked(value);
    }
}
