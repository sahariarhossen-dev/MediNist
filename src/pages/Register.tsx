import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Store, User, MapPin, ClipboardList, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getDivisions, getDistricts, getUpazilas } from "@/data/bangladeshLocations";
import { toast } from "sonner";

interface FormData {
  shopName: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress: string;
}

const steps = [
  { label: "Shop Name", icon: Store },
  { label: "Owner Info", icon: User },
  { label: "Location", icon: MapPin },
  { label: "Review", icon: ClipboardList },
];

const Register = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shopNameStatus, setShopNameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [form, setForm] = useState<FormData>({
    shopName: "",
    fullName: "",
    phone: "",
    email: "",
    password: "",
    division: "",
    district: "",
    upazila: "",
    streetAddress: "",
  });

  // Check shop name uniqueness with debounce
  useEffect(() => {
    if (!form.shopName.trim() || form.shopName.trim().length < 2) {
      setShopNameStatus("idle");
      return;
    }
    setShopNameStatus("checking");
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("pharmacies")
        .select("id")
        .ilike("name", form.shopName.trim())
        .limit(1);
      setShopNameStatus(data && data.length > 0 ? "taken" : "available");
    }, 500);
    return () => clearTimeout(timer);
  }, [form.shopName]);

  // Reset dependent location fields
  useEffect(() => {
    setForm((prev) => ({ ...prev, district: "", upazila: "" }));
  }, [form.division]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, upazila: "" }));
  }, [form.district]);

  const updateForm = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 0:
        return form.shopName.trim().length >= 2 && shopNameStatus === "available";
      case 1:
        return (
          form.fullName.trim().length > 0 &&
          form.phone.trim().length > 0 &&
          form.email.trim().length > 0 &&
          form.password.length >= 6
        );
      case 2:
        return !!form.division && !!form.district && !!form.upazila;
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("register-pharmacy", {
        body: {
          shopName: form.shopName.trim(),
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          password: form.password,
          division: form.division,
          district: form.district,
          upazila: form.upazila,
          streetAddress: form.streetAddress.trim(),
        },
      });

      if (res.error) {
        toast.error(res.error.message || "Registration failed");
        return;
      }

      const data = res.data;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        toast.success("Account created successfully!");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <h1 className="text-2xl font-bold text-blue-600 text-center mb-6">Medinist</h1>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < currentStep
                    ? "bg-green-500 text-white"
                    : i === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < currentStep ? <Check size={16} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${i < currentStep ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="p-6 border-0 shadow-lg rounded-2xl">
          <h2 className="text-lg font-bold text-foreground mb-1">{steps[currentStep].label}</h2>
          <p className="text-xs text-muted-foreground mb-5">
            {currentStep === 0 && "Enter your shop or pharmacy name"}
            {currentStep === 1 && "Enter the owner's details"}
            {currentStep === 2 && "Select your pharmacy location"}
            {currentStep === 3 && "Review your information"}
          </p>

          {/* Step 1: Shop Name */}
          {currentStep === 0 && (
            <div className="space-y-3">
              <Input
                placeholder="Shop / Pharmacy Name"
                value={form.shopName}
                onChange={(e) => updateForm("shopName", e.target.value)}
                className="h-12"
              />
              {shopNameStatus === "checking" && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
              )}
              {shopNameStatus === "available" && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check size={14} /> Shop name is available
                </p>
              )}
              {shopNameStatus === "taken" && (
                <p className="text-xs text-destructive">This shop name is already taken</p>
              )}
            </div>
          )}

          {/* Step 2: Owner Info */}
          {currentStep === 1 && (
            <div className="space-y-3">
              <Input
                placeholder="Full Name"
                value={form.fullName}
                onChange={(e) => updateForm("fullName", e.target.value)}
                className="h-12"
              />
              <Input
                placeholder="Phone Number"
                type="tel"
                value={form.phone}
                onChange={(e) => updateForm("phone", e.target.value)}
                className="h-12"
              />
              <Input
                placeholder="Email"
                type="email"
                value={form.email}
                onChange={(e) => updateForm("email", e.target.value)}
                className="h-12"
              />
              <div className="relative">
                <Input
                  placeholder="Password (min 6 characters)"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  className="h-12 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Location */}
          {currentStep === 2 && (
            <div className="space-y-3">
              <Select value={form.division} onValueChange={(v) => updateForm("division", v)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select Division" />
                </SelectTrigger>
                <SelectContent>
                  {getDivisions().map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={form.district}
                onValueChange={(v) => updateForm("district", v)}
                disabled={!form.division}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select District" />
                </SelectTrigger>
                <SelectContent>
                  {getDistricts(form.division).map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={form.upazila}
                onValueChange={(v) => updateForm("upazila", v)}
                disabled={!form.district}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select Upazila" />
                </SelectTrigger>
                <SelectContent>
                  {getUpazilas(form.division, form.district).map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="Street Address (Optional)"
                value={form.streetAddress}
                onChange={(e) => updateForm("streetAddress", e.target.value)}
                className="h-12"
              />
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 3 && (
            <div className="space-y-3 text-sm">
              {[
                { label: "Shop Name", value: form.shopName, step: 0 },
                { label: "Full Name", value: form.fullName, step: 1 },
                { label: "Phone", value: form.phone, step: 1 },
                { label: "Email", value: form.email, step: 1 },
                { label: "Division", value: form.division, step: 2 },
                { label: "District", value: form.district, step: 2 },
                { label: "Upazila", value: form.upazila, step: 2 },
                { label: "Street Address", value: form.streetAddress || "—", step: 2 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-muted-foreground text-xs">{item.label}</p>
                    <p className="font-medium text-foreground">{item.value}</p>
                  </div>
                  <button
                    onClick={() => setCurrentStep(item.step)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {currentStep > 0 && (
              <Button variant="outline" className="flex-1 h-12" onClick={() => setCurrentStep(currentStep - 1)}>
                <ChevronLeft size={16} /> Back
              </Button>
            )}
            {currentStep < 3 ? (
              <Button
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
                disabled={!canGoNext()}
                onClick={() => setCurrentStep(currentStep + 1)}
              >
                Next <ChevronRight size={16} />
              </Button>
            ) : (
              <Button
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
                disabled={loading}
                onClick={handleSubmit}
              >
                {loading ? "Creating Account..." : "Confirm & Create Account"}
              </Button>
            )}
          </div>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <button className="text-blue-600 hover:underline font-medium">Sign In</button>
        </p>
      </div>
    </div>
  );
};

export default Register;
