import { useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { FacilitiesField } from "@/features/owner/facilities-field";
import {
  ActionButton,
  BackButton,
  ChoiceButton,
  FormInput,
  humanizeToken,
  rupeesToPaise,
} from "@/features/owner/owner-ui";
import { useAppDispatch } from "@/store/hooks";
import {
  BATHROOM_TYPES,
  MEAL_TYPES,
  PG_FOR_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  PROPERTY_TYPES,
  ROOM_TYPES,
  useCreatePropertyMutation,
  type BathroomType,
  type MealType,
  type PgFor,
  type PreferredTenantType,
  type PropertyFacility,
  type PropertyType,
  type RoomType,
} from "@/store/services/property-api";
import { setSelectedOwnerPropertyId } from "@/store/slices/owner-workspace-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerRegisterPropertyScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors, type } = useTheme();
  const toast = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("PG");
  const [pgFor, setPgFor] = useState<PgFor>("ANYONE");
  const [preferredFor, setPreferredFor] = useState<PreferredTenantType>("ANYONE");
  const [includedMeals, setIncludedMeals] = useState<MealType[]>([]);
  const [electricityIncluded, setElectricityIncluded] = useState(false);
  const [bathroomType, setBathroomType] = useState<BathroomType>("COMMON");
  const [availableSharingTypes, setAvailableSharingTypes] = useState<RoomType[]>([]);
  const [facilities, setFacilities] = useState<PropertyFacility[]>([]);
  const [customFacilities, setCustomFacilities] = useState<string[]>([]);
  const [deposit, setDeposit] = useState("");
  const [noticeDays, setNoticeDays] = useState("30");
  const [graceDays, setGraceDays] = useState("3");
  const [lateFee, setLateFee] = useState("");
  const [acRate, setAcRate] = useState("");
  const [nonAcRate, setNonAcRate] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  // Validation/submit failures surface as toasts; success navigates to property.
  const setError = (value: string | null) => {
    if (value) {
      toast.error(value);
    }
  };
  const [createProperty, { isLoading }] = useCreatePropertyMutation();

  async function submit() {
    if (isLoading) {
      return;
    }
    if (!name.trim() || !address.trim() || !area.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError("Name, address line 1, area, city, state and pincode are required.");
      return;
    }
    const depositPaise = rupeesToPaise(deposit);
    if (depositPaise == null) {
      setError("Enter the standard deposit amount.");
      return;
    }
    const notice = Number(noticeDays);
    const grace = Number(graceDays);
    if (!Number.isInteger(notice) || notice < 0 || !Number.isInteger(grace) || grace < 0) {
      setError("Notice and grace days must be whole numbers.");
      return;
    }

    setError(null);
    try {
      const property = await createProperty({
        address: address.trim(),
        area: area.trim(),
        availableSharingTypes,
        bathroomType,
        city: city.trim(),
        customFacilities,
        dailyGuestAcRatePaise: rupeesToPaise(acRate),
        dailyGuestNonAcRatePaise: rupeesToPaise(nonAcRate),
        discoveryDescription: description.trim() || null,
        discoveryHeadline: headline.trim() || null,
        discoveryProfileImageUrl: null,
        electricityIncluded,
        facilities,
        foodIncluded: includedMeals.length > 0,
        includedMeals,
        latitude: null,
        longitude: null,
        name: name.trim(),
        noticePeriodDays: notice,
        pgFor,
        pincode: pincode.trim(),
        preferredFor,
        rentGraceDays: grace,
        rentLateFeePerDayPaise: rupeesToPaise(lateFee),
        standardDepositPaise: depositPaise,
        state: state.trim(),
        type: propertyType,
      }).unwrap();
      dispatch(setSelectedOwnerPropertyId(property.id));
      router.replace("/owner-property");
    } catch {
      setError("Could not register the property. Please check the details and try again.");
    }
  }

  function toggleMeal(meal: MealType) {
    setIncludedMeals((current) => (current.includes(meal) ? current.filter((item) => item !== meal) : [...current, meal]));
  }

  function toggleSharingType(roomType: RoomType) {
    setAvailableSharingTypes((current) => (current.includes(roomType) ? current.filter((item) => item !== roomType) : [...current, roomType]));
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />
      <ScreenHeader
        eyebrow="New property"
        title="Register a"
        italicTail="property."
        subtitle="This creates the owner property and its discovery listing together."
      />

      <FormSection eyebrow="Basics" title="Name & location">
        <FormInput autoCapitalize="words" label="Property name" onChangeText={setName} placeholder="e.g. Sunrise Residency" value={name} />
        <FormInput label="Address line 1" multiline onChangeText={setAddress} placeholder="Building, street, landmark" value={address} />
        <FormInput autoCapitalize="words" label="Address line 2 / Area" onChangeText={setArea} placeholder="Area or locality" value={area} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput autoCapitalize="words" label="City" onChangeText={setCity} placeholder="City" value={city} />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput autoCapitalize="words" label="State" onChangeText={setState} placeholder="State" value={state} />
          </View>
        </View>
        <FormInput keyboardType="number-pad" label="Pincode" maxLength={6} onChangeText={setPincode} placeholder="6 digit pincode" value={pincode} />
      </FormSection>

      <FormSection eyebrow="Setup" title="Rooms & inclusions">
        <OptionGroup label="Property type">
          {PROPERTY_TYPES.map((option) => (
            <ChoiceButton active={option === propertyType} key={option} label={humanizeToken(option)} onPress={() => setPropertyType(option)} />
          ))}
        </OptionGroup>

        <OptionGroup label="PG for">
          {PG_FOR_OPTIONS.map((option) => (
            <ChoiceButton active={option === pgFor} key={option} label={humanizeToken(option)} onPress={() => setPgFor(option)} />
          ))}
        </OptionGroup>

        <OptionGroup label="Preferred for">
          {PREFERRED_TENANT_OPTIONS.map((option) => (
            <ChoiceButton active={option === preferredFor} key={option} label={humanizeToken(option)} onPress={() => setPreferredFor(option)} />
          ))}
        </OptionGroup>

        <OptionGroup label="Meals included">
          {MEAL_TYPES.map((meal) => (
            <ChoiceButton active={includedMeals.includes(meal)} key={meal} label={humanizeToken(meal)} onPress={() => toggleMeal(meal)} />
          ))}
        </OptionGroup>

        <OptionGroup label="Electricity included">
          <ChoiceButton active={electricityIncluded} label="Yes" onPress={() => setElectricityIncluded(true)} />
          <ChoiceButton active={!electricityIncluded} label="No" onPress={() => setElectricityIncluded(false)} />
        </OptionGroup>

        <OptionGroup label="Bathroom type">
          {BATHROOM_TYPES.map((option) => (
            <ChoiceButton active={option === bathroomType} key={option} label={humanizeToken(option)} onPress={() => setBathroomType(option)} />
          ))}
        </OptionGroup>

        <OptionGroup label="Sharing options">
          {ROOM_TYPES.map((option) => (
            <ChoiceButton active={availableSharingTypes.includes(option)} key={option} label={humanizeToken(option)} onPress={() => toggleSharingType(option)} />
          ))}
        </OptionGroup>

        <FacilitiesField
          customFacilities={customFacilities}
          facilities={facilities}
          onChangeCustom={setCustomFacilities}
          onChangeFacilities={setFacilities}
        />
      </FormSection>

      <FormSection eyebrow="Money" title="Pricing & policy">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Deposit (₹)" onChangeText={setDeposit} placeholder="10000" value={deposit} />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Late fee/day (₹)" onChangeText={setLateFee} placeholder="Optional" value={lateFee} />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="number-pad" label="Notice days" onChangeText={setNoticeDays} placeholder="30" value={noticeDays} />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="number-pad" label="Grace days" onChangeText={setGraceDays} placeholder="3" value={graceDays} />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Guest AC/day (₹)" onChangeText={setAcRate} placeholder="Optional" value={acRate} />
          </View>
          <View style={{ flex: 1 }}>
            <FormInput keyboardType="decimal-pad" label="Guest non-AC/day (₹)" onChangeText={setNonAcRate} placeholder="Optional" value={nonAcRate} />
          </View>
        </View>
      </FormSection>

      <FormSection eyebrow="Listing" title="Discovery profile">
        <FormInput autoCapitalize="sentences" label="Headline" onChangeText={setHeadline} placeholder="Short listing headline" value={headline} />
        <FormInput label="Description" multiline onChangeText={setDescription} placeholder="What should prospects know?" value={description} />
      </FormSection>

      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={isLoading} label={isLoading ? "Registering…" : "Register property"} onPress={() => void submit()} />
      </View>
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    </ScreenScrollView>
  );
}

function FormSection({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={[type.eyebrow, { color: colors.accent }]} selectable>
          {eyebrow}
        </Text>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "500", letterSpacing: -0.3 }} selectable>
          {title}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>{children}</View>
    </Card>
  );
}

function OptionGroup({ children, label }: { children: ReactNode; label: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.label, { color: colors.inkSoft }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{children}</View>
    </View>
  );
}
