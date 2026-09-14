package com.payscope.seed;

import com.payscope.employee.Department;
import com.payscope.employee.EmployeeStatus;
import com.payscope.employee.EmploymentType;
import com.payscope.employee.Level;
import com.payscope.employee.Role;

import java.time.LocalDate;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Deterministic given a seed. The distribution is shaped rather than uniform: a
 * level pyramid, salaries clustered around each band midpoint, and a small
 * deliberate minority outside the band so the outlier feature has something
 * true to find - spec section 11.
 */
public class EmployeeGenerator {

    public record GeneratedEmployee(String employeeNumber, String fullName, String email,
                                    Department department, String countryCode, Role role, Level level,
                                    EmploymentType employmentType, LocalDate hireDate,
                                    EmployeeStatus status, double bandFactor, int raiseCount) {
    }

    // A ~10,000-person organisation needs enough name combinations that duplicates are
    // occasional rather than systematic. The previous 20x20 pool gave 400 combinations for
    // 10,000 people - about 25 copies of every name, which sorted by name produced visible
    // runs of identical rows and made the seed look broken. These pools give ~21,000
    // combinations, so a duplicate is realistic rather than constant.
    private static final String[] GIVEN_NAMES = {
            "Aarav", "Abena", "Adam", "Adanna", "Adrian", "Agnieszka", "Ahmed", "Aiko", "Ajay",
            "Alejandro", "Alice", "Amara", "Amelia", "Ana", "Anders", "Andrea", "Aneta", "Anika",
            "Anton", "Arjun", "Asha", "Astrid", "Ayesha", "Beatriz", "Ben", "Bianca", "Bilal",
            "Bruno", "Camila", "Carlos", "Caroline", "Catarina", "Chen", "Chiara", "Chloe",
            "Daniel", "Dana", "Darius", "David", "Deepa", "Diego", "Dmitri", "Ekaterina", "Elena",
            "Eli", "Emeka", "Emma", "Enzo", "Erik", "Esther", "Fabio", "Farid", "Fatima", "Felix",
            "Fernanda", "Finn", "Florence", "Gabriel", "Georgia", "Grace", "Gustavo", "Hana",
            "Hannah", "Harpreet", "Hassan", "Henrik", "Hiro", "Ibrahim", "Ingrid", "Ines",
            "Isabel", "Ivan", "Jamal", "James", "Javier", "Jin", "Joana", "Johan", "Jonas",
            "Julia", "Kai", "Karan", "Kavya", "Keiko", "Khalid", "Klara", "Lars", "Laura", "Leila",
            "Leo", "Liam", "Lin", "Lucas", "Lucia", "Mads", "Maria", "Mariam", "Marta", "Mateo",
            "Mei", "Mika", "Minh", "Miriam", "Mohan", "Nadia", "Naomi", "Natalia", "Neha", "Niels",
            "Nikhil", "Nina", "Noor", "Olga", "Oliver", "Omar", "Paulo", "Pedro", "Petra", "Priya",
            "Rafael", "Rahul", "Rania", "Ravi", "Rebecca", "Renata", "Ricardo", "Rosa", "Ruth",
            "Sanjay", "Sara", "Sebastian", "Selin", "Shreya", "Simone", "Sofia", "Sonia", "Stefan",
            "Sven", "Tara", "Thomas", "Tobias", "Valentina", "Vikram", "Wei", "Yara", "Yuki",
            "Zara", "Zoe"};
    private static final String[] FAMILY_NAMES = {
            "Abebe", "Acosta", "Adebayo", "Agarwal", "Ahmed", "Almeida", "Andersson", "Araujo",
            "Arnold", "Bakker", "Banerjee", "Barros", "Becker", "Bennett", "Berg", "Bergmann",
            "Bhat", "Blanco", "Braun", "Cardoso", "Carter", "Castro", "Chandra", "Chatterjee",
            "Chaudhry", "Chen", "Choi", "Clarke", "Costa", "Cruz", "Dalton", "Das", "Delgado",
            "Desai", "Dubois", "Duarte", "Eriksson", "Esposito", "Farrell", "Fernandes", "Ferrari",
            "Fischer", "Fonseca", "Freeman", "Gallagher", "Garcia", "Ghosh", "Gomes", "Gonzalez",
            "Grant", "Greco", "Gupta", "Haddad", "Hall", "Hansen", "Hartmann", "Hassan",
            "Hoffmann", "Holmes", "Hussain", "Ibrahim", "Iyer", "Jackson", "Jain", "Jensen",
            "Johansson", "Jones", "Joshi", "Kapoor", "Kaur", "Keller", "Khan", "Kim", "Klein",
            "Koch", "Kowalski", "Krishnan", "Kumar", "Lambert", "Larsen", "Lawson", "Lee", "Lima",
            "Lindqvist", "Lopez", "Lund", "Macedo", "Mahmood", "Malhotra", "Marsh", "Martins",
            "Mehta", "Melo", "Mendes", "Menon", "Meyer", "Mitchell", "Moreau", "Morris", "Muller",
            "Nair", "Nakamura", "Navarro", "Neumann", "Nguyen", "Nilsson", "Novak", "Nunes", "Obi",
            "Okonkwo", "Oliveira", "Olsen", "Ortiz", "Pandey", "Park", "Patel", "Pereira",
            "Peters", "Petrov", "Pinto", "Rahman", "Ramirez", "Ramos", "Rao", "Reddy", "Ribeiro",
            "Richardson", "Rocha", "Rodrigues", "Rossi", "Saito", "Santos", "Schneider", "Sharma",
            "Shetty", "Silva", "Singh", "Sinha", "Sousa", "Stewart", "Suzuki", "Tanaka", "Tavares",
            "Thomas", "Vargas", "Verma", "Wagner", "Walsh", "Wei", "Weber", "Williams", "Wong",
            "Yadav", "Yamamoto", "Zhang", "Zhao"};

    /** country code, weight */
    private static final Object[][] COUNTRIES = {
            {"US", 30}, {"IN", 30}, {"GB", 15}, {"DE", 10}, {"SG", 8}, {"BR", 7}};

    /** level, weight - a pyramid, not a uniform draw */
    private static final Object[][] LEVELS = {
            {Level.JUNIOR, 35}, {Level.MID, 30}, {Level.SENIOR, 20}, {Level.STAFF, 10}, {Level.PRINCIPAL, 5}};

    /** role paired with the department it belongs to */
    private static final Object[][] ROLES = {
            {Role.SOFTWARE_ENGINEER, Department.ENGINEERING, 30},
            {Role.DATA_ENGINEER, Department.ENGINEERING, 10},
            {Role.PRODUCT_MANAGER, Department.PRODUCT, 8},
            {Role.DESIGNER, Department.DESIGN, 7},
            {Role.ACCOUNT_EXECUTIVE, Department.SALES, 15},
            {Role.MARKETING_MANAGER, Department.MARKETING, 8},
            {Role.ACCOUNTANT, Department.FINANCE, 7},
            {Role.RECRUITER, Department.PEOPLE, 5},
            {Role.SUPPORT_SPECIALIST, Department.SUPPORT, 10}};

    private final Random random;

    public EmployeeGenerator(long seed) {
        this.random = new Random(seed);
    }

    public List<GeneratedEmployee> generate(int count) {
        return IntStream.range(0, count).mapToObj(this::one).toList();
    }

    private GeneratedEmployee one(int index) {
        String given = GIVEN_NAMES[random.nextInt(GIVEN_NAMES.length)];
        String family = FAMILY_NAMES[random.nextInt(FAMILY_NAMES.length)];
        String country = (String) weighted(COUNTRIES, 0, 1);
        Level level = (Level) weighted(LEVELS, 0, 1);

        Object[] roleRow = weightedRow(ROLES, 2);
        Role role = (Role) roleRow[0];
        Department department = (Department) roleRow[1];

        // 2% clearly underpaid, 2% clearly overpaid, the rest clustered around the midpoint.
        double draw = random.nextDouble();
        double bandFactor;
        if (draw < 0.02) {
            bandFactor = 0.60 + random.nextDouble() * 0.19;
        } else if (draw < 0.04) {
            bandFactor = 1.21 + random.nextDouble() * 0.29;
        } else {
            bandFactor = 0.85 + random.nextDouble() * 0.30;
        }

        LocalDate hireDate = LocalDate.of(2015, 1, 1).plusDays(random.nextInt(4000));
        EmployeeStatus status = random.nextDouble() < 0.08 ? EmployeeStatus.INACTIVE : EmployeeStatus.ACTIVE;
        EmploymentType type = random.nextDouble() < 0.90 ? EmploymentType.FULL_TIME
                : (random.nextBoolean() ? EmploymentType.PART_TIME : EmploymentType.CONTRACT);
        int raiseCount = random.nextDouble() < 0.30 ? 1 + random.nextInt(3) : 0;

        return new GeneratedEmployee(
                "PS-%06d".formatted(index + 1),
                given + " " + family,
                "%s.%s.%d@acme.test".formatted(given.toLowerCase(), family.toLowerCase(), index + 1),
                department, country, role, level, type, hireDate, status, bandFactor, raiseCount);
    }

    private Object weighted(Object[][] rows, int valueIndex, int weightIndex) {
        return weightedRow(rows, weightIndex)[valueIndex];
    }

    private Object[] weightedRow(Object[][] rows, int weightIndex) {
        int total = 0;
        for (Object[] row : rows) {
            total += (Integer) row[weightIndex];
        }
        int pick = random.nextInt(total);
        for (Object[] row : rows) {
            pick -= (Integer) row[weightIndex];
            if (pick < 0) {
                return row;
            }
        }
        return rows[rows.length - 1];
    }
}
